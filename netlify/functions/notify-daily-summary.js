/* ================================================
   netlify/functions/notify-daily-summary.js
   Cron 1x/jour à 9h UTC — envoie un résumé Telegram
   de toutes les alertes Fort du jour (LG1 + LG2),
   triées par kickoff_unix.
   Idempotent : une seule notification par jour.
   ================================================ */

const { requireAuth } = require('./lib/auth.cjs');
const { corsHeaders, handlePreflight } = require('./lib/cors.cjs');
const { sendMessage } = require('./lib/telegram.cjs');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

// --- Helpers ---

function getTodayStr() {
  return new Date().toISOString().split('T')[0];
}

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
    console.error(`[notify-daily-summary] notifications_sent insert failed: ${res.status} ${body}`);
    return false;
  }
  return true;
}

function formatFrenchDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  return d.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
}

function formatTime(kickoffUnix) {
  if (!kickoffUnix) return '??:??';
  return new Date(kickoffUnix * 1000).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Paris',
  });
}

function buildMatchLines(alerts) {
  return alerts.map((a, i) => {
    const prefix = i === alerts.length - 1 ? '└' : '├';
    const time = formatTime(a.kickoff_unix);
    const match = `${a.home_team_name} – ${a.away_team_name}`;
    return `${prefix} ${time}  ${match}`;
  });
}

function buildSummaryText(today, alerts) {
  const dateLabel = formatFrenchDate(today);

  if (alerts.length === 0) {
    return `☀️ <b>Alertes Fort — ${dateLabel}</b>\n\nAucune alerte Fort aujourd'hui.`;
  }

  const lg1Alerts = alerts.filter(a => a.signal_type.startsWith('LG1'));
  const lg2Alerts = alerts.filter(a => a.signal_type.startsWith('LG2'));

  const lines = [`☀️ <b>Alertes Fort — ${dateLabel}</b>`];

  if (lg1Alerts.length > 0) {
    const label = lg1Alerts.length === 1 ? 'match' : 'matchs';
    lines.push('');
    lines.push(`⚡ <b>LG1</b>  ·  ${lg1Alerts.length} ${label}`);
    lines.push(...buildMatchLines(lg1Alerts));
  }

  if (lg2Alerts.length > 0) {
    const label = lg2Alerts.length === 1 ? 'match' : 'matchs';
    lines.push('');
    lines.push(`⏱ <b>LG2</b>  ·  ${lg2Alerts.length} ${label}`);
    lines.push(...buildMatchLines(lg2Alerts));
  }

  return lines.join('\n');
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

  const results = { notified: false, alerts_count: 0, errors: [] };

  try {
    const today = getTodayStr();
    const refKey = `daily_summary:${today}`;

    // Vérifier idempotence : déjà envoyé aujourd'hui ?
    const existingRows = await supabaseFetch(
      'notifications_sent',
      `kind=eq.daily_summary&ref_key=eq.${encodeURIComponent(refKey)}&select=id&limit=1`
    );
    if (existingRows.length > 0) {
      console.log(`[notify-daily-summary] résumé déjà envoyé pour ${today}`);
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', ...cors },
        body: JSON.stringify({ ...results, skipped: true, reason: 'already_sent' }),
      };
    }

    // Récupérer les alertes Fort du jour (non exclues), triées par kickoff
    // user_excluded=neq.true pour inclure les alertes où user_excluded est null ou false
    const alertsParams = [
      `match_date=eq.${today}`,
      'confidence=eq.fort',
      'user_excluded=neq.true',
      'order=kickoff_unix.asc',
      'select=match_id,signal_type,home_team_name,away_team_name,league_name,kickoff_unix',
    ].join('&');

    const alerts = await supabaseFetch('alerts', alertsParams);
    results.alerts_count = alerts.length;

    const text = buildSummaryText(today, alerts);
    const sent = await sendMessage(text);
    if (!sent) {
      results.errors.push('sendMessage failed');
    } else {
      await supabaseInsertNotification('daily_summary', refKey);
      results.notified = true;
      console.log(`[notify-daily-summary] résumé envoyé pour ${today} — ${alerts.length} alertes Fort`);
    }
  } catch (e) {
    console.error(`[notify-daily-summary] FATAL: ${e.message}`);
    results.errors.push(e.message);
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', ...cors },
    body: JSON.stringify(results),
  };
};

// Netlify Scheduled Function — tous les jours à 9h UTC
exports.config = {
  schedule: '0 9 * * *',
};
