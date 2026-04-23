/* ================================================
   netlify/functions/delete-alerts.js
   Supprime une liste d'alertes par ID (service_role).
   POST { ids: number[] }
   ================================================ */

const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  let ids;
  try {
    ({ ids } = JSON.parse(event.body || '{}'));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'JSON invalide' }) };
  }

  if (!Array.isArray(ids) || ids.length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: 'ids requis (tableau non vide)' }) };
  }

  const { error, count } = await supabase
    .from('alerts')
    .delete({ count: 'exact' })
    .in('id', ids);

  if (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ deleted: count ?? ids.length }),
  };
};
