/* ================================================
   netlify/functions/compute-team-fhg.js
   Tache planifiee — calcul FHG% par equipe par saison.
   Lit h2h_matches (saison courante), calcule le % de matchs
   ou chaque equipe a marque en 0-45 min (stoppage compris),
   et upserte dans team_fhg_cache.
   Tourne 1x/jour a 7h UTC via Netlify Scheduled Functions.
   ================================================ */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

function getCurrentSeasonStart() {
  const now = new Date();
  const year = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  return `${year}-07-01`;
}

/**
 * Un but est en 1MT (0-45 min, stoppage compris) si :
 * - raw contient "+" et la base est <= 45  (ex: "45+2" → oui, "90+3" → non)
 * - sinon min <= 45
 */
function isFirstHalfGoal(g) {
  if (g.raw && g.raw.includes('+')) {
    return parseInt(g.raw) <= 45;
  }
  return g.min <= 45;
}

async function fetchMatches(seasonStart) {
  const PAGE = 1000;
  let offset = 0;
  let all = [];
  while (true) {
    const url = `${SUPABASE_URL}/rest/v1/h2h_matches`
      + `?select=home_team_id,home_team_name,away_team_id,away_team_name,season_id,goal_events`
      + `&match_date=gte.${seasonStart}`
      + `&goal_events=not.is.null`
      + `&order=match_date.asc`
      + `&limit=${PAGE}&offset=${offset}`;
    const res = await fetch(url, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Range-Unit': 'items',
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      console.error(`[compute-team-fhg] Supabase error: ${res.status}`);
      break;
    }
    const batch = await res.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    all.push(...batch);
    if (batch.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

async function upsertCache(rows) {
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const url = `${SUPABASE_URL}/rest/v1/team_fhg_cache?on_conflict=season_id,team_id`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(batch),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const txt = await res.text();
      console.error(`[compute-team-fhg] upsert error: ${res.status} ${txt}`);
    }
  }
}

exports.handler = async function() {
  try {
    const seasonStart = getCurrentSeasonStart();
    console.log(`[compute-team-fhg] Saison courante depuis ${seasonStart}`);

    const matches = await fetchMatches(seasonStart);
    console.log(`[compute-team-fhg] ${matches.length} matchs charges`);

    if (matches.length === 0) {
      return { statusCode: 200, body: 'Aucun match — rien a calculer.' };
    }

    // Agregation : { "season_id:team_id" -> { season_id, team_id, team_name, total, fhg } }
    const stats = new Map();

    function addMatch(seasonId, teamId, teamName, isHome, goalEvents) {
      if (!seasonId || !teamId) return;
      const key = `${seasonId}:${teamId}`;
      if (!stats.has(key)) stats.set(key, { season_id: seasonId, team_id: teamId, team_name: teamName, total: 0, fhg: 0 });
      const s = stats.get(key);
      s.total++;
      const events = Array.isArray(goalEvents) ? goalEvents : [];
      const scored1MT = events.some(g => {
        const isTeamGoal = isHome ? g.home === true : g.home === false;
        return isTeamGoal && isFirstHalfGoal(g);
      });
      if (scored1MT) s.fhg++;
    }

    for (const m of matches) {
      addMatch(m.season_id, m.home_team_id, m.home_team_name, true,  m.goal_events);
      addMatch(m.season_id, m.away_team_id, m.away_team_name, false, m.goal_events);
    }

    const rows = [];
    for (const s of stats.values()) {
      if (s.total === 0) continue;
      rows.push({
        season_id:     s.season_id,
        team_id:       s.team_id,
        team_name:     s.team_name,
        fhg_pct:       Math.round(s.fhg / s.total * 100),
        matches_count: s.total,
        updated_at:    new Date().toISOString(),
      });
    }

    console.log(`[compute-team-fhg] ${rows.length} equipes a upsert`);
    await upsertCache(rows);
    console.log(`[compute-team-fhg] Done.`);

    return {
      statusCode: 200,
      body: JSON.stringify({ teams: rows.length, matches: matches.length }),
    };
  } catch (err) {
    console.error('[compute-team-fhg] Erreur:', err.message);
    return { statusCode: 500, body: err.message };
  }
};
