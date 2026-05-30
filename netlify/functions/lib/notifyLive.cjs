/* ================================================
   netlify/functions/lib/notifyLive.cjs
   Orchestrateur partagé des crons de notification live.
   Récupère « Mes matchs » (selected_alerts) joints aux
   alertes, filtre par famille (LG1/LG2) + fenêtre temporelle
   (offset depuis le coup d'envoi), déduplique par match,
   envoie une notification Telegram idempotente.
   ================================================ */

const { requireAuth } = require('./auth.cjs');
const { corsHeaders, handlePreflight } = require('./cors.cjs');
const { sendMessage } = require('./telegram.cjs');
const {
  computeKickoffWindow,
  isInLiveWindow,
  matchesFamily,
  dedupeByMatch,
} = require('./notifyWindow.cjs');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

// Seul un match encore "pending" (non résolu) doit déclencher une notif live.
// Enum réel de alerts.status : pending / validated / lost / expired.
const LIVE_STATUS = 'pending';

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
    console.error(`[notify-live] notifications_sent insert failed for ${refKey}: ${res.status} ${body}`);
    return false;
  }
  return true;
}

async function isAlreadyNotified(kind, refKey) {
  const params = `kind=eq.${encodeURIComponent(kind)}&ref_key=eq.${encodeURIComponent(refKey)}&select=id&limit=1`;
  const rows = await supabaseFetch('notifications_sent', params);
  return rows.length > 0;
}

/**
 * Exécute un cron de notification live.
 * @param {object} event - événement Netlify Function
 * @param {object} config
 * @param {string} config.kind - kind d'idempotence (ex. 'lg1_live')
 * @param {'LG1'|'LG2'} config.family - famille de signal à traiter
 * @param {number} config.offsetSec - délai depuis le coup d'envoi
 * @param {(alert: object) => string} config.buildMessage - construit le texte Telegram
 * @param {string} config.logTag - préfixe de log
 * @returns {Promise<object>} réponse Netlify
 */
async function runLiveNotifier(event, { kind, family, offsetSec, buildMessage, logTag }) {
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
    const { start: windowStart, end: windowEnd } = computeKickoffWindow(nowUnix, offsetSec);

    // 1. Récupérer les sélections actives (« Mes matchs »)
    const selectedRows = await supabaseFetch('selected_alerts', 'select=match_id,signal_type');
    if (selectedRows.length === 0) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', ...cors },
        body: JSON.stringify({ ...results, message: 'Aucune sélection active' }),
      };
    }

    const matchIds = [...new Set(selectedRows.map(r => r.match_id).filter(Boolean))];
    if (matchIds.length === 0) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', ...cors },
        body: JSON.stringify({ ...results, message: 'Aucune sélection exploitable' }),
      };
    }
    const selectedSet = new Set(selectedRows.map(r => `${r.match_id}:${r.signal_type}`));

    // 2. Alertes des matchs sélectionnés dans la fenêtre de kickoff, uniquement "pending".
    // Borne basse exclusive (gt) + haute inclusive (lte) => partition stricte qui colle à
    // isInLiveWindow (elapsed ∈ [offset, offset+width[), sans recouvrement entre 2 runs.
    const alertsParams = [
      `match_id=in.(${matchIds.join(',')})`,
      `kickoff_unix=gt.${windowStart}`,
      `kickoff_unix=lte.${windowEnd}`,
      `status=eq.${LIVE_STATUS}`,
      'select=match_id,signal_type,home_team_name,away_team_name,league_name,kickoff_unix,confidence,status',
    ].join('&');

    const alertsInWindow = await supabaseFetch('alerts', alertsParams);

    // 3. Garder les (match_id, signal_type) sélectionnés, de la bonne famille, et dans la
    // fenêtre live (garde défensif redondant avec le SQL, protège d'un kickoff limite).
    const eligible = alertsInWindow.filter(a =>
      selectedSet.has(`${a.match_id}:${a.signal_type}`) &&
      matchesFamily(a.signal_type, family) &&
      isInLiveWindow(a.kickoff_unix, nowUnix, offsetSec)
    );

    // 4. Déduplication : une seule notif par match (signal de plus forte confiance)
    const deduped = dedupeByMatch(eligible);
    results.checked = deduped.length;

    for (const alert of deduped) {
      const refKey = `${kind}:${alert.match_id}`;
      try {
        if (await isAlreadyNotified(kind, refKey)) {
          results.skipped++;
          continue;
        }

        const sent = await sendMessage(buildMessage(alert));
        if (!sent) {
          results.errors.push(`sendMessage failed for ${refKey}`);
          continue;
        }

        await supabaseInsertNotification(kind, refKey);
        results.notified++;
        console.log(`[${logTag}] notifié: ${refKey}`);
      } catch (e) {
        console.error(`[${logTag}] error for ${refKey}: ${e.message}`);
        results.errors.push(e.message);
      }
    }
  } catch (e) {
    console.error(`[${logTag}] FATAL: ${e.message}`);
    results.errors.push(e.message);
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', ...cors },
    body: JSON.stringify(results),
  };
}

module.exports = { runLiveNotifier };
