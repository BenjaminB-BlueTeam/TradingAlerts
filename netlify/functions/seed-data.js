/* ================================================
   netlify/functions/seed-data.js
   Seed Supabase avec les données FootyStats.
   Orchestration côté client : 1 ligue par appel.
   ================================================ */

const FOOTYSTATS_BASE = 'https://api.football-data-api.com';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

// --- Helpers Supabase REST ---

async function supabaseRequest(table, method, body, query = '') {
  const url = `${SUPABASE_URL}/rest/v1/${table}${query}`;
  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': method === 'POST' ? 'resolution=merge-duplicates,return=minimal' : 'return=minimal',
  };
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase ${method} ${table}: ${res.status} — ${text}`);
  }
  // return=minimal renvoie 201 (POST) ou 204 (PATCH/DELETE) avec body vide
  const text = await res.text();
  if (!text) return null;
  return JSON.parse(text);
}

async function supabaseSelect(table, query = '') {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${query}`;
  const res = await fetch(url, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`Supabase GET ${table}: ${res.status}`);
  return await res.json();
}

// --- Helper FootyStats API ---

async function footyRequest(endpoint, params = {}) {
  const apiKey = process.env.FOOTYSTATS_API_KEY;
  if (!apiKey) throw new Error('FOOTYSTATS_API_KEY non configurée');
  const url = new URL(`${FOOTYSTATS_BASE}/${endpoint}`);
  url.searchParams.set('key', apiKey);
  Object.entries(params).forEach(([k, v]) => {
    if (v != null) url.searchParams.set(k, String(v));
  });
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`FootyStats ${endpoint}: HTTP ${res.status}`);
  return await res.json();
}

// --- Helpers CORS ---

function respond(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify(body),
  };
}

// --- Actions ---

async function startFull(maxSeasons = 5) {
  // Créer un seed_job
  await supabaseRequest('seed_jobs', 'POST',
    { status: 'in_progress', progress: {} },
    '?select=id'
  );

  // Récupérer la liste depuis Supabase pour avoir le job_id
  const jobs = await supabaseSelect('seed_jobs', 'order=id.desc&limit=1');
  const jobId = jobs[0]?.id;

  // Récupérer les ligues actives depuis FootyStats
  const leaguesData = await footyRequest('league-list', { chosen_leagues_only: 'true' });
  const rawLeagues = leaguesData?.data || [];
  const leagues = rawLeagues.map(l => {
    const seasons = l.season || [];
    const sorted = [...seasons].sort((a, b) => {
      return String(b.year).localeCompare(String(a.year));
    });
    const last = sorted.slice(0, maxSeasons);
    return {
      id: last[0]?.id,                          // season_id de la saison courante
      name: l.name || 'Unknown',
      country: l.country || '',
      season_ids: last.map(s => s.id),           // IDs des N dernières saisons
    };
  }).filter(l => l.id);

  return respond(200, { job_id: jobId, leagues, total: leagues.length });
}

async function seedLeague(seasonId) {
  // Récupère les matchs depuis FootyStats et retourne les rows formatées
  // L'insert Supabase est fait côté client pour éviter le timeout
  try {
    const matchesData = await footyRequest('league-matches', { season_id: seasonId });
    const matches = matchesData?.data || [];

    const rows = matches.map(m => {
      // Extraire les minutes des buts depuis homeGoals_timings / awayGoals_timings
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
        league_id: Number(seasonId),
        season_id: Number(seasonId),
        match_id: m.id,
        match_date: m.date_unix ? new Date(m.date_unix * 1000).toISOString().split('T')[0] : m.date || '1970-01-01',
        home_goals: m.homeGoalCount ?? m.homeGoals ?? 0,
        away_goals: m.awayGoalCount ?? m.awayGoals ?? 0,
        home_goals_ht: m.team_a_ht_score ?? m.ht_goals_team_a ?? 0,
        away_goals_ht: m.team_b_ht_score ?? m.ht_goals_team_b ?? 0,
        goal_events: goalMinutes,
        last_updated: new Date().toISOString(),
      };
    });

    return respond(200, { matches: rows.length, rows });
  } catch (e) {
    return respond(200, { matches: 0, rows: [], errors: [e.message] });
  }
}

async function getStatus(jobId) {
  const jobs = await supabaseSelect('seed_jobs', `id=eq.${jobId}`);
  if (!jobs.length) return respond(404, { error: 'Job introuvable' });
  return respond(200, jobs[0]);
}

// --- Handler ---

exports.handler = async (event) => {
  const { action, league_id, job_id, seasons } = event.queryStringParameters || {};

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return respond(503, { error: 'SUPABASE_URL ou SUPABASE_ANON_KEY non configurée' });
  }

  try {
    switch (action) {
      case 'start_full':
        return await startFull();
      case 'seed_league':
        if (!league_id) return respond(400, { error: 'league_id requis' });
        return await seedLeague(league_id);
      case 'status':
        if (!job_id) return respond(400, { error: 'job_id requis' });
        return await getStatus(job_id);
      default:
        return respond(400, { error: `Action inconnue : ${action}` });
    }
  } catch (e) {
    return respond(500, { error: e.message });
  }
};
