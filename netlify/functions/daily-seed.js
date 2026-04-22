/* ================================================
   netlify/functions/daily-seed.js
   Tache planifiee — seed quotidien des matchs de la veille.
   Recupere les matchs termines d'hier via FootyStats
   et les upsert dans h2h_matches (Supabase).
   Tourne 1x/jour a 6h UTC via Netlify Scheduled Functions.
   ================================================ */

const { footyRequest } = require('./lib/api');
const { parseMatchRow } = require('./lib/parseMatch');

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

// --- Main ---

// Generer une liste de dates YYYY-MM-DD entre from et to (inclus)
function getDateRange(from, to) {
  const dates = [];
  const d = new Date(from + 'T00:00:00Z');
  const end = new Date(to + 'T00:00:00Z');
  while (d <= end) {
    dates.push(d.toISOString().split('T')[0]);
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

// Seed les matchs d'une date donnee, retourne { fetched, completed, upserted }
async function seedDate(date) {
  const data = await footyRequest('todays-matches', { date });
  const allMatches = data?.data || [];
  const completedMatches = allMatches.filter(m =>
    m.id && m.homeID && m.awayID && m.status === 'complete'
  );
  if (completedMatches.length === 0) return { fetched: allMatches.length, completed: 0, upserted: 0 };
  const rows = completedMatches.map(parseMatchRow);
  const upserted = await supabaseUpsert('h2h_matches', rows);
  return { fetched: allMatches.length, completed: completedMatches.length, upserted };
}

exports.handler = async (event) => {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('[daily-seed] SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY non configure');
    return { statusCode: 503, body: JSON.stringify({ error: 'Supabase non configure' }) };
  }

  // Supporter une plage de dates via query params : ?from=2026-03-29&to=2026-04-22
  const params = event.queryStringParameters || {};
  const from = params.from;
  const to = params.to;

  // Mode backfill (query params) : exiger SEED_AUTH_TOKEN
  if (from || to) {
    const expectedToken = process.env.SEED_AUTH_TOKEN;
    if (!expectedToken) {
      return { statusCode: 503, body: JSON.stringify({ error: 'Backfill désactivé : SEED_AUTH_TOKEN manquant' }) };
    }
    const authHeader = event.headers?.authorization || event.headers?.Authorization;
    if (authHeader !== `Bearer ${expectedToken}`) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized — SEED_AUTH_TOKEN requis pour le backfill' }) };
    }
  }

  let dates;
  if (from && to) {
    dates = getDateRange(from, to);
    console.log(`[daily-seed] START — backfill mode: ${dates.length} days (${from} → ${to})`);
  } else if (from) {
    dates = getDateRange(from, getYesterdayStr());
    console.log(`[daily-seed] START — backfill mode: ${dates.length} days (${from} → ${getYesterdayStr()})`);
  } else {
    dates = [getYesterdayStr()];
    console.log(`[daily-seed] START — daily mode: ${dates[0]}`);
  }

  const results = { mode: dates.length > 1 ? 'backfill' : 'daily', dates: dates.length, fetched: 0, completed: 0, upserted: 0, errors: [], details: [] };

  for (const date of dates) {
    try {
      const r = await seedDate(date);
      results.fetched += r.fetched;
      results.completed += r.completed;
      results.upserted += r.upserted;
      results.details.push({ date, ...r });
      console.log(`[daily-seed] ${date}: fetched=${r.fetched}, completed=${r.completed}, upserted=${r.upserted}`);
    } catch (e) {
      console.error(`[daily-seed] ${date} ERROR: ${e.message}`);
      results.errors.push(`${date}: ${e.message}`);
    }
  }

  console.log(`[daily-seed] END — ${results.dates} days, fetched=${results.fetched}, completed=${results.completed}, upserted=${results.upserted}, errors=${results.errors.length}`);
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
