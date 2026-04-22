/* ================================================
   netlify/functions/daily-seed.js
   Tache planifiee — seed quotidien des matchs de la veille.
   Recupere les matchs termines d'hier via FootyStats
   et les upsert dans h2h_matches (Supabase).
   Tourne 1x/jour a 6h UTC via Netlify Scheduled Functions.
   ================================================ */

const { footyRequest } = require('./lib/api');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

// --- Helpers ---

function getYesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

async function supabaseUpsert(table, rows) {
  // Upsert en batch de 200 (meme pattern que seed-data.js)
  const BATCH = 200;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const url = `${SUPABASE_URL}/rest/v1/${table}?on_conflict=match_id`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(batch),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Supabase upsert ${table} batch ${i}: ${res.status} — ${text}`);
    }
    inserted += batch.length;
  }
  return inserted;
}

function parseMatchRow(m) {
  // Extraire les minutes des buts (meme logique que seed-data.js)
  let goalMinutes = [];
  const homeTimings = m.homeGoals_timings || m.homeGoals || [];
  const awayTimings = m.awayGoals_timings || m.awayGoals || [];
  if (Array.isArray(homeTimings)) {
    homeTimings.forEach(t => {
      const min = parseInt(t);
      if (min > 0) goalMinutes.push({ min, home: true });
    });
  }
  if (Array.isArray(awayTimings)) {
    awayTimings.forEach(t => {
      const min = parseInt(t);
      if (min > 0) goalMinutes.push({ min, home: false });
    });
  }
  goalMinutes.sort((a, b) => a.min - b.min);

  return {
    home_team_id: m.homeID,
    away_team_id: m.awayID,
    home_team_name: m.home_name || null,
    away_team_name: m.away_name || null,
    league_id: m.competition_id || m.league_id || null,
    season_id: m.season || m.competition_id || null,
    match_id: m.id,
    match_date: m.date_unix ? new Date(m.date_unix * 1000).toISOString().split('T')[0] : m.date || '1970-01-01',
    home_goals: m.homeGoalCount ?? m.homeGoals ?? 0,
    away_goals: m.awayGoalCount ?? m.awayGoals ?? 0,
    home_goals_ht: m.team_a_ht_score ?? m.ht_goals_team_a ?? 0,
    away_goals_ht: m.team_b_ht_score ?? m.ht_goals_team_b ?? 0,
    goal_events: goalMinutes,
    last_updated: new Date().toISOString(),
  };
}

// --- Main ---

exports.handler = async (event) => {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('[daily-seed] SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY non configure');
    return { statusCode: 503, body: JSON.stringify({ error: 'Supabase non configure' }) };
  }

  const yesterday = getYesterdayStr();
  console.log(`[daily-seed] START — fetching matches for ${yesterday}`);

  const results = { date: yesterday, fetched: 0, completed: 0, upserted: 0, errors: [] };

  try {
    // Recuperer les matchs d'hier
    const data = await footyRequest('todays-matches', { date: yesterday });
    const allMatches = data?.data || [];
    results.fetched = allMatches.length;
    console.log(`[daily-seed] ${allMatches.length} matches fetched for ${yesterday}`);

    if (allMatches.length === 0) {
      console.log('[daily-seed] END — no matches yesterday');
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(results),
      };
    }

    // Filtrer les matchs termines (status = "complete" dans FootyStats)
    const completedMatches = allMatches.filter(m =>
      m.id && m.homeID && m.awayID && m.status === 'complete'
    );
    results.completed = completedMatches.length;
    console.log(`[daily-seed] ${completedMatches.length} completed matches to upsert`);

    if (completedMatches.length === 0) {
      console.log('[daily-seed] END — no completed matches');
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(results),
      };
    }

    // Transformer en rows h2h_matches
    const rows = completedMatches.map(parseMatchRow);

    // Upsert dans Supabase
    results.upserted = await supabaseUpsert('h2h_matches', rows);
    console.log(`[daily-seed] ${results.upserted} rows upserted into h2h_matches`);
  } catch (e) {
    console.error(`[daily-seed] ERROR: ${e.message}`);
    results.errors.push(e.message);
  }

  console.log(`[daily-seed] END — fetched=${results.fetched}, completed=${results.completed}, upserted=${results.upserted}, errors=${results.errors.length}`);
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(results),
  };
};

// Netlify Scheduled Function — tous les jours a 6h UTC
exports.config = {
  schedule: '0 6 * * *',
};
