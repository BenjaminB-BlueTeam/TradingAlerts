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

async function seedLeague(seasonId, jobId) {
  const results = { teams: 0, matches: 0, errors: [] };

  try {
    // 1. Récupérer et batch-insert les équipes
    const teamsData = await footyRequest('league-teams', { season_id: seasonId, include: 'stats' });
    const teams = teamsData?.data || [];

    const teamRows = teams.map(team => ({
      team_id: team.id,
      team_name: team.name || team.cleanName || 'Unknown',
      league_id: Number(seasonId),
      league_name: team.competition?.name || null,
      season_id: team.season || 0,
      season_label: team.seasonLabel || null,
      country: team.country || null,
      matches_played: team.matches_played || team.seasonMatchesPlayed_overall || 0,
      goals_scored: team.goals_scored || team.seasonGoals_overall || 0,
      goals_conceded: team.goals_conceded || team.seasonConceded_overall || 0,
      goals_scored_0_15: team.goals_scored_min_0_to_15 || 0,
      goals_scored_16_30: team.goals_scored_min_16_to_30 || 0,
      goals_scored_31_45: team.goals_scored_min_31_to_45 || 0,
      goals_scored_46_60: team.goals_scored_min_46_to_60 || 0,
      goals_scored_61_75: team.goals_scored_min_61_to_75 || 0,
      goals_scored_76_90: team.goals_scored_min_76_to_90 || 0,
      goals_conceded_0_15: team.goals_conceded_min_0_to_15 || 0,
      goals_conceded_16_30: team.goals_conceded_min_16_to_30 || 0,
      goals_conceded_31_45: team.goals_conceded_min_31_to_45 || 0,
      goals_conceded_46_60: team.goals_conceded_min_46_to_60 || 0,
      goals_conceded_61_75: team.goals_conceded_min_61_to_75 || 0,
      goals_conceded_76_90: team.goals_conceded_min_76_to_90 || 0,
      first_half_goals_scored: (team.goals_scored_min_0_to_15 || 0) + (team.goals_scored_min_16_to_30 || 0) + (team.goals_scored_min_31_to_45 || 0),
      first_half_goals_conceded: (team.goals_conceded_min_0_to_15 || 0) + (team.goals_conceded_min_16_to_30 || 0) + (team.goals_conceded_min_31_to_45 || 0),
      matches_scored_first_half: team.matches_scored_first_half || 0,
      comeback_rate: team.pct_retour_si_encaisse || 0,
      home_win_rate: team.pct_victoire_domicile || team.seasonWinsPercentage_home || 0,
      away_win_rate: team.seasonWinsPercentage_away || 0,
      last_updated: new Date().toISOString(),
    }));

    if (teamRows.length > 0) {
      await supabaseRequest('team_seasons', 'POST', teamRows, '?on_conflict=team_id,season_id');
      results.teams = teamRows.length;
    }

    // 2. Récupérer et batch-insert les matchs
    const matchesData = await footyRequest('league-matches', { season_id: seasonId });
    const matches = matchesData?.data || [];

    const matchRows = matches.map(m => {
      let goalEvents = [];
      if (m.goalscorer && Array.isArray(m.goalscorer)) {
        goalEvents = m.goalscorer.map(g => ({
          minute: g.time || g.minute || null,
          team: g.team || null,
          player: g.player || null,
          home: g.home_or_away === 'home' || g.team_id === m.homeID,
        }));
      }
      return {
        home_team_id: m.homeID,
        away_team_id: m.awayID,
        home_team_name: m.home_name || null,
        away_team_name: m.away_name || null,
        league_id: Number(seasonId),
        season_id: m.season || null,
        match_id: m.id,
        match_date: m.date_unix ? new Date(m.date_unix * 1000).toISOString().split('T')[0] : m.date || '1970-01-01',
        home_goals: m.homeGoalCount ?? m.homeGoals ?? 0,
        away_goals: m.awayGoalCount ?? m.awayGoals ?? 0,
        home_goals_ht: m.team_a_ht_score ?? m.ht_goals_team_a ?? 0,
        away_goals_ht: m.team_b_ht_score ?? m.ht_goals_team_b ?? 0,
        goal_events: goalEvents,
        last_updated: new Date().toISOString(),
      };
    });

    // Batch insert par lots de 500 pour éviter les limites Supabase
    for (let i = 0; i < matchRows.length; i += 500) {
      const batch = matchRows.slice(i, i + 500);
      await supabaseRequest('h2h_matches', 'POST', batch, '?on_conflict=match_id');
    }
    results.matches = matchRows.length;

  } catch (e) {
    results.errors.push(e.message);
  }

  return respond(200, results);
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
        return await seedLeague(league_id, job_id);
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
