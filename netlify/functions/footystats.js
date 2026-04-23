/* ================================================
   netlify/functions/footystats.js
   Proxy sécurisé vers l'API FootyStats.
   La clé API est lue depuis les variables d'env Netlify
   (FOOTYSTATS_API_KEY) — jamais exposée au navigateur.
   ================================================ */

const BASE_URL = 'https://api.football-data-api.com';

const ALLOWED_ENDPOINTS = new Set([
  'league-list', 'league-teams', 'league-matches', 'league-tables',
  'league-season', 'todays-matches', 'match', 'team', 'lastx', 'country-list'
]);

exports.handler = async (event) => {
  const { endpoint, ...params } = event.queryStringParameters || {};

  if (!endpoint) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Paramètre endpoint manquant' }),
    };
  }

  if (!ALLOWED_ENDPOINTS.has(endpoint)) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: `Endpoint non autorisé : ${endpoint}` }),
    };
  }

  const apiKey = process.env.FOOTYSTATS_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 503,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'FOOTYSTATS_API_KEY non configurée sur Netlify' }),
    };
  }

  try {
    const paramKeys = Object.keys(params);
    console.log(`[footystats-proxy] ${endpoint} (${paramKeys.length} params: ${paramKeys.join(', ')})`);

    const url = new URL(`${BASE_URL}/${endpoint}`);
    url.searchParams.set('key', apiKey);
    Object.entries(params).forEach(([k, v]) => {
      if (v != null) url.searchParams.set(k, v);
    });

    const response = await fetch(url.toString(), { signal: AbortSignal.timeout(8000) });
    if (!response.ok) {
      console.error(`[footystats-proxy] Upstream error: ${endpoint} -> HTTP ${response.status}`);
    }
    const data = await response.json();

    return {
      statusCode: response.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || 'https://tradingfootalerts.netlify.app',
      },
      body: JSON.stringify(data),
    };
  } catch (e) {
    console.error(`[footystats-proxy] Exception for ${endpoint}: ${e.message}`);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: `Erreur proxy : ${e.message}` }),
    };
  }
};
