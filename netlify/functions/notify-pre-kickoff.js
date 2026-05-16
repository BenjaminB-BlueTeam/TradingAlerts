/* ================================================
   netlify/functions/notify-pre-kickoff.js
   Cron toutes les 5 minutes — envoie une notification
   Telegram pour les matchs sélectionnés dont le coup
   d'envoi est dans ~10 minutes (fenêtre [+9min, +11min]).
   ================================================ */

const { requireAuth } = require('./lib/auth.cjs');
const { corsHeaders, handlePreflight } = require('./lib/cors.cjs');
const { sendMessage } = require('./lib/telegram.cjs');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

// --- Helpers ---

async function supabaseFetch(path, params = '') {
  const url = `${SUPABASE_URL}/rest/v1/${path}${params ? '?' + params : ''}`;
  const res = await fetch(url, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Supabase GET ${path}: ${res.status} ${body.slice(0, 200)}`);
  }
  return res.json();
}

async function supabaseInsertNotification(kind, refKey) {
  const url = `${SUPABASE_URL}/rest/v1/notifications_sent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=ignore-duplicates,return=minimal',
    },
    body: JSON.stringify({ kind, ref_key: refKey }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`[notify-pre-kickoff] notifications_sent insert failed for ${refKey}: ${res.status} ${body}`);
    return false;
  }
  return true;
}

async function isAlreadyNotified(kind, refKey) {
  const params = `kind=eq.${encodeURIComponent(kind)}&ref_key=eq.${encodeURIComponent(refKey)}&select=id&limit=1`;
  const rows = await supabaseFetch('notifications_sent', params);
  return rows.length > 0;
}

// --- Main ---

exports.handler = async (event) => {
  const preflight = handlePreflight(event);
  if (preflight) return preflight;

  const cors = corsHeaders(event.headers?.origin || event.headers?.Origin);

  const auth = requireAuth(event, { allowScheduled: true });
  if (!auth.authorized) return { ...auth.response, headers: { ...(auth.response.headers || {}), ...cors } };

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return { statusCode: 503, headers: cors, body: JSON.stringify({ error: 'Supabase non configuré' }) };
  }

  const results = { checked: 0, notified: 0, skipped: 0, errors: [] };

  try {
    const nowUnix = Math.floor(Date.now() / 1000);
    const windowStart = nowUnix;            // maintenant
    const windowEnd = nowUnix + 5 * 60;    // +5 min

    // 1. Récupérer les sélections actives
    const selectedRows = await supabaseFetch('selected_alerts', 'select=match_id,signal_type');
    if (selectedRows.length === 0) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', ...cors },
        body: JSON.stringify({ ...results, message: 'Aucune sélection active' }),
      };
    }

    const matchIds = [...new Set(selectedRows.map(r => r.match_id))];

    // 2. Trouver les alertes dans la fenêtre de kickoff, pour les matchs sélectionnés
    const alertsParams = [
      `match_id=in.(${matchIds.join(',')})`,
      `kickoff_unix=gte.${windowStart}`,
      `kickoff_unix=lte.${windowEnd}`,
      'select=match_id,signal_type,home_team_name,away_team_name,league_name,kickoff_unix,confidence',
    ].join('&');

    const alertsInWindow = await supabaseFetch('alerts', alertsParams);
    results.checked = alertsInWindow.length;

    // Construire un Set des (match_id, signal_type) sélectionnés pour filtrage rapide
    const selectedSet = new Set(selectedRows.map(r => `${r.match_id}:${r.signal_type}`));

    for (const alert of alertsInWindow) {
      // Ne notifier que si ce (match_id, signal_type) est effectivement sélectionné
      if (!selectedSet.has(`${alert.match_id}:${alert.signal_type}`)) {
        continue;
      }

      const refKey = `pre_kickoff:${alert.match_id}:${alert.signal_type}`;
      try {
        const alreadySent = await isAlreadyNotified('pre_kickoff', refKey);
        if (alreadySent) {
          results.skipped++;
          continue;
        }

        const timeStr = new Date(alert.kickoff_unix * 1000).toLocaleTimeString('fr-FR', {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Europe/Paris',
        });
        const confidenceLabel = alert.confidence === 'fort' ? 'Fort' : 'Moyen';
        const category = alert.signal_type.startsWith('LG2') ? 'LG2' : 'LG1';
        const text = [
          '⚽ <b>Match dans 10 min !</b>',
          '',
          `<b>${alert.home_team_name} – ${alert.away_team_name}</b>`,
          `⏰ ${timeStr}  ·  ${alert.league_name || 'Ligue inconnue'}`,
          `🎯 ${category}  ·  ${confidenceLabel}`,
        ].join('\n');

        const sent = await sendMessage(text);
        if (!sent) {
          results.errors.push(`sendMessage failed for ${refKey}`);
          continue;
        }

        await supabaseInsertNotification('pre_kickoff', refKey);
        results.notified++;
        console.log(`[notify-pre-kickoff] notifié: ${refKey}`);
      } catch (e) {
        console.error(`[notify-pre-kickoff] error for ${refKey}: ${e.message}`);
        results.errors.push(e.message);
      }
    }
  } catch (e) {
    console.error(`[notify-pre-kickoff] FATAL: ${e.message}`);
    results.errors.push(e.message);
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', ...cors },
    body: JSON.stringify(results),
  };
};

// Netlify Scheduled Function — toutes les 5 minutes
exports.config = {
  schedule: '*/5 * * * *',
};
