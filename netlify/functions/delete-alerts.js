/* ================================================
   netlify/functions/delete-alerts.js
   Supprime une liste d'alertes par ID (service_role).
   POST { ids: number[] }
   ================================================ */

const { createClient } = require('@supabase/supabase-js');
const { requireAuth } = require('./lib/auth.cjs');
const { corsHeaders, handlePreflight } = require('./lib/cors.cjs');

exports.handler = async (event) => {
  const preflight = handlePreflight(event);
  if (preflight) return preflight;

  const cors = corsHeaders(event.headers?.origin || event.headers?.Origin);

  const auth = requireAuth(event);
  if (!auth.authorized) return { ...auth.response, headers: { ...(auth.response.headers || {}), ...cors } };

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: cors, body: 'Method Not Allowed' };
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  let ids;
  try {
    ({ ids } = JSON.parse(event.body || '{}'));
  } catch {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'JSON invalide' }) };
  }

  if (!Array.isArray(ids) || ids.length === 0) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'ids requis (tableau non vide)' }) };
  }

  const { error, count } = await supabase
    .from('alerts')
    .delete({ count: 'exact' })
    .in('id', ids);

  if (error) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: error.message }) };
  }

  return {
    statusCode: 200,
    headers: cors,
    body: JSON.stringify({ deleted: count ?? ids.length }),
  };
};
