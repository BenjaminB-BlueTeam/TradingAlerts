/* ================================================
   netlify/functions/lib/api.js
   Helpers partagés — FootyStats API + Supabase REST
   ================================================ */

const FOOTYSTATS_BASE = 'https://api.football-data-api.com';

/**
 * Requête vers l'API FootyStats via la clé serveur.
 * Utilisé par generate-alerts, check-results et seed-data.
 */
async function footyRequest(endpoint, params = {}) {
  const apiKey = process.env.FOOTYSTATS_API_KEY;
  if (!apiKey) throw new Error('FOOTYSTATS_API_KEY non configurée');
  const url = new URL(`${FOOTYSTATS_BASE}/${endpoint}`);
  url.searchParams.set('key', apiKey);
  Object.entries(params).forEach(([k, v]) => {
    if (v != null) url.searchParams.set(k, String(v));
  });
  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`FootyStats ${endpoint}: HTTP ${res.status}`);
  return await res.json();
}

/**
 * Lecture Supabase REST (GET).
 * Utilisé par generate-alerts et check-results.
 */
async function supabaseQuery(table, query = '') {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  const url = `${supabaseUrl}/rest/v1/${table}?${query}`;
  const res = await fetch(url, {
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return [];
  return await res.json();
}

module.exports = { footyRequest, supabaseQuery };
