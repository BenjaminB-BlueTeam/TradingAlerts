/* ================================================
   netlify/functions/notify-lg1-live.js
   Cron toutes les 5 minutes — notifie chaque match de
   « Mes matchs » (selected_alerts) ~30 min après le coup
   d'envoi, juste avant la fenêtre but 31-45' (LG1).
   ================================================ */

const { runLiveNotifier } = require('./lib/notifyLive.cjs');
const { LG1_OFFSET_SEC } = require('./lib/notifyWindow.cjs');

function buildMessage(alert) {
  const timeStr = new Date(alert.kickoff_unix * 1000).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Paris',
  });
  const confidenceLabel = alert.confidence === 'fort' ? 'Fort' : alert.confidence === 'moyen' ? 'Moyen' : '—';
  return [
    "⚡ <b>Fenêtre LG1 imminente</b>",
    '',
    `<b>${alert.home_team_name} – ${alert.away_team_name}</b>`,
    `⏰ Coup d'envoi ${timeStr}  ·  ${alert.league_name || 'Ligue inconnue'}`,
    `🎯 But attendu 31-45'  ·  ${confidenceLabel}`,
  ].join('\n');
}

exports.handler = async (event) => runLiveNotifier(event, {
  kind: 'lg1_live',
  family: 'LG1',
  offsetSec: LG1_OFFSET_SEC,
  buildMessage,
  logTag: 'notify-lg1-live',
});

// Netlify Scheduled Function — toutes les 5 minutes
exports.config = {
  schedule: '*/5 * * * *',
};
