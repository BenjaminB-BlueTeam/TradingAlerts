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
  if (res.status === 204) return null;
  return await res.json();
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

async function startFull() {
  // Créer un seed_job
  const jobRows = await supabaseRequest('seed_jobs', 'POST',
    { status: 'in_progress', progress: {} },
    '?select=id'
  );

  // Récupérer la liste depuis Supabase pour avoir le job_id
  const jobs = await supabaseSelect('seed_jobs', 'order=id.desc&limit=1');
  const jobId = jobs[0]?.id;

  // Récupérer les ligues actives depuis FootyStats
  const leaguesData = await footyRequest('country-leagues');
  const leagues = (leaguesData?.data || leaguesData || []).map(l => ({
    id: l.id || l.league_id,
    name: l.name || l.league_name,
    country: l.country || '',
  }));

  return respond(200, { job_id: jobId, leagues, total: leagues.length });
}

async function seedLeague(leagueId, jobId, seasonsCount) {
  const results = { teams: 0, matches: 0, errors: [] };

  try {
    // 1. Récupérer les équipes de la ligue
    const teamsData = await footyRequest('league-teams', { league_id: leagueId });
    const teams = teamsData?.data || [];

    // Upsert team_seasons
    for (const team of teams) {
      try {
        const row = {
          team_id: team.id,
          team_name: team.name || team.cleanName || 'Unknown',
          league_id: Number(leagueId),
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
          raw_data: team,
        };
        await supabaseRequest('team_seasons', 'POST', row, '?on_conflict=team_id,season_id');
        results.teams++;
      } catch (e) {
        results.errors.push(`team ${team.id}: ${e.message}`);
      }
    }

    // 2. Récupérer les matchs de la ligue
    const matchesData = await footyRequest('league-matches', { league_id: leagueId });
    const matches = matchesData?.data || [];

    for (const m of matches) {
      try {
        // Extraire goal_events depuis goalscorer si disponible
        let goalEvents = [];
        if (m.goalscorer && Array.isArray(m.goalscorer)) {
          goalEvents = m.goalscorer.map(g => ({
            minute: g.time || g.minute || null,
            team: g.team || null,
            player: g.player || null,
            home: g.home_or_away === 'home' || g.team_id === m.homeID,
          }));
        }

        const row = {
          home_team_id: m.homeID,
          away_team_id: m.awayID,
          home_team_name: m.home_name || null,
          away_team_name: m.away_name || null,
          league_id: Number(leagueId),
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
        await supabaseRequest('h2h_matches', 'POST', row, '?on_conflict=match_id');
        results.matches++;
      } catch (e) {
        results.errors.push(`match ${m.id}: ${e.message}`);
      }
    }

    // Mettre à jour le job progress
    if (jobId) {
      try {
        const jobs = await supabaseSelect('seed_jobs', `id=eq.${jobId}`);
        const job = jobs[0];
        const progress = job?.progress || {};
        progress[leagueId] = {
          status: 'done',
          teams: results.teams,
          matches: results.matches,
          errors: results.errors.length,
        };
        await supabaseRequest('seed_jobs', 'PATCH', { progress }, `?id=eq.${jobId}`);
      } catch (e) {
        results.errors.push(`job update: ${e.message}`);
      }
    }

  } catch (e) {
    results.errors.push(e.message);
    // Marquer l'erreur dans le job
    if (jobId) {
      try {
        const jobs = await supabaseSelect('seed_jobs', `id=eq.${jobId}`);
        const job = jobs[0];
        const progress = job?.progress || {};
        progress[leagueId] = { status: 'error', error: e.message };
        await supabaseRequest('seed_jobs', 'PATCH', { progress }, `?id=eq.${jobId}`);
      } catch {}
    }
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
        return await seedLeague(league_id, job_id, parseInt(seasons) || 3);
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
