/* ================================================
   netlify/functions/notify-lg2-live.js
   Cron toutes les 5 minutes — notifie chaque match de
   « Mes matchs » (selected_alerts) ~95 min après le coup
   d'envoi (45' + 15' pause + 35'), à l'entrée de la fenêtre
   but >=80' (LG2). FootyStats n'expose pas de minute live
   exploitable → offset fixe depuis le coup d'envoi.
   ================================================ */

const { runLiveNotifier } = require('./lib/notifyLive.cjs');
const { LG2_OFFSET_SEC } = require('./lib/notifyWindow.cjs');

function buildMessage(alert) {
  const timeStr = new Date(alert.kickoff_unix * 1000).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Paris',
  });
  const confidenceLabel = alert.confidence === 'fort' ? 'Fort' : alert.confidence === 'moyen' ? 'Moyen' : '—';
  return [
    '⏱️ <b>LG2 — surveille la fin de match</b>',
    '',
    `<b>${alert.home_team_name} – ${alert.away_team_name}</b>`,
    `⏰ Coup d'envoi ${timeStr}  ·  ${alert.league_name || 'Ligue inconnue'}`,
    `🎯 But attendu ≥80'  ·  ${confidenceLabel}`,
  ].join('\n');
}

exports.handler = async (event) => runLiveNotifier(event, {
  kind: 'lg2_live',
  family: 'LG2',
  offsetSec: LG2_OFFSET_SEC,
  buildMessage,
  logTag: 'notify-lg2-live',
});

// Netlify Scheduled Function — toutes les 5 minutes
exports.config = {
  schedule: '*/5 * * * *',
};
