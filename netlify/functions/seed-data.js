/* ================================================
   netlify/functions/seed-data.js
   Seed Supabase avec les données FootyStats.
   Orchestration côté client : 1 ligue par appel.
   ================================================ */

const { footyRequest } = require('./lib/api');
const { parseMatchRow } = require('./lib/parseMatch');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

// --- Helpers Supabase REST ---

async function supabaseRequest(table, method, body, query = '') {
  const url = `${SUPABASE_URL}/rest/v1/${table}${query}`;
  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': method === 'POST' ? 'resolution=merge-duplicates,return=minimal' : 'return=minimal',
  };
  const opts = { method, headers, signal: AbortSignal.timeout(8000) };
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
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Supabase GET ${table}: ${res.status}`);
  return await res.json();
}

// --- Helpers CORS ---

function respond(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': 'https://tradingfootalerts.netlify.app',
    },
    body: JSON.stringify(body),
  };
}

// --- Actions ---

async function startFull(maxSeasons = 5) {
  console.log(`[seed-data] action=start_full, maxSeasons=${maxSeasons}`);
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

  console.log(`[seed-data] start_full complete — job_id=${jobId}, ${leagues.length} leagues found`);
  return respond(200, { job_id: jobId, leagues, total: leagues.length });
}

async function seedLeague(seasonId) {
  console.log(`[seed-data] action=seed_league, season_id=${seasonId}`);
  // Récupère les matchs depuis FootyStats et retourne les rows formatées
  // L'insert Supabase est fait côté client pour éviter le timeout
  try {
    // Timeout étendu à 25s : league-matches peut renvoyer 300+ matchs
    const matchesData = await footyRequest('league-matches', { season_id: seasonId }, 25000);
    const matches = matchesData?.data || [];

    const rows = matches.map(m => parseMatchRow(m, { seasonId }));

    console.log(`[seed-data] seed_league season_id=${seasonId} — ${rows.length} match rows prepared`);
    return respond(200, { matches: rows.length, rows });
  } catch (e) {
    console.error(`[seed-data] seed_league season_id=${seasonId} ERROR: ${e.message}`);
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
  const expectedToken = process.env.SEED_AUTH_TOKEN;
  if (!expectedToken) {
    console.error('[seed-data] SEED_AUTH_TOKEN non configuré — fonction désactivée');
    return { statusCode: 503, body: JSON.stringify({ error: 'Seed désactivé : SEED_AUTH_TOKEN manquant' }) };
  }
  const authHeader = event.headers?.authorization || event.headers?.Authorization;
  if (authHeader !== `Bearer ${expectedToken}`) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const { action, league_id, job_id } = event.queryStringParameters || {};

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
    console.error(`[seed-data] FATAL: ${e.message}`);
    return respond(500, { error: e.message });
  }
};
