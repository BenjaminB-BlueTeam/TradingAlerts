/* ================================================
   netlify/functions/footystats.js
   Proxy sécurisé vers l'API FootyStats.
   La clé API est lue depuis les variables d'env Netlify
   (FOOTYSTATS_API_KEY) — jamais exposée au navigateur.
   ================================================ */

const BASE_URL = 'https://api.football-data-api.com';

exports.handler = async (event) => {
  const { endpoint, ...params } = event.queryStringParameters || {};

  if (!endpoint) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Paramètre endpoint manquant' }),
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
    const url = new URL(`${BASE_URL}/${endpoint}`);
    url.searchParams.set('key', apiKey);
    Object.entries(params).forEach(([k, v]) => {
      if (v != null) url.searchParams.set(k, v);
    });

    const response = await fetch(url.toString());
    const data = await response.json();

    return {
      statusCode: response.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify(data),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: `Erreur proxy : ${e.message}` }),
    };
  }
};
