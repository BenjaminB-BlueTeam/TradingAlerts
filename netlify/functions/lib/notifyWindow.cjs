/* ================================================
   netlify/functions/lib/notifyWindow.cjs
   Logique PURE (sans I/O) partagée par les crons de
   notification live LG1/LG2. Extraite pour être testée
   unitairement (Vitest).
   ================================================ */

// Offsets de déclenchement (en secondes depuis le coup d'envoi)
const LG1_OFFSET_SEC = 30 * 60;  // 1800 — juste avant la fenêtre but 31-45'
const LG2_OFFSET_SEC = 95 * 60;  // 5700 — 45' + 15' pause + 35' ≈ entrée fenêtre but >=80'
const WINDOW_WIDTH_SEC = 5 * 60; // 300 — = période du cron (partition stricte gt/lte, 1 run par match)

/**
 * Calcule les bornes de kickoff_unix pour la requête Supabase.
 * On cherche les matchs dont le coup d'envoi remonte à [offset, offset+width[.
 * @param {number} nowUnix - timestamp Unix courant (secondes)
 * @param {number} offsetSec - délai depuis le coup d'envoi
 * @param {number} [widthSec=WINDOW_WIDTH_SEC] - largeur de la fenêtre
 * @returns {{ start: number, end: number }} bornes inclusives sur kickoff_unix
 */
function computeKickoffWindow(nowUnix, offsetSec, widthSec = WINDOW_WIDTH_SEC) {
  return {
    start: nowUnix - offsetSec - widthSec,
    end: nowUnix - offsetSec,
  };
}

/**
 * Indique si un match est dans la fenêtre live (started il y a ~offset).
 * elapsed = now - kickoff doit appartenir à [offset, offset+width[.
 * @param {number} kickoffUnix
 * @param {number} nowUnix
 * @param {number} offsetSec
 * @param {number} [widthSec=WINDOW_WIDTH_SEC]
 * @returns {boolean}
 */
function isInLiveWindow(kickoffUnix, nowUnix, offsetSec, widthSec = WINDOW_WIDTH_SEC) {
  if (!kickoffUnix) return false;
  const elapsed = nowUnix - kickoffUnix;
  return elapsed >= offsetSec && elapsed < offsetSec + widthSec;
}

/**
 * Filtre famille : 'LG2' => signal_type commence par 'LG2' ; 'LG1' => tout le reste.
 * @param {string} signalType
 * @param {'LG1'|'LG2'} family
 * @returns {boolean}
 */
function matchesFamily(signalType, family) {
  if (!signalType) return false;
  const isLg2 = signalType.startsWith('LG2');
  return family === 'LG2' ? isLg2 : !isLg2;
}

/**
 * Rang de confiance pour départager des signaux d'un même match.
 * @param {string|null} confidence
 * @returns {number} fort=2, moyen=1, autre/null=0
 */
function confidenceRank(confidence) {
  if (confidence === 'fort') return 2;
  if (confidence === 'moyen') return 1;
  return 0;
}

/**
 * Déduplique une liste d'alertes par match_id, en gardant pour chaque match
 * le signal de plus forte confiance (fort > moyen > null). En cas d'égalité,
 * conserve le premier rencontré.
 * @param {Array<object>} alerts - objets avec au moins { match_id, confidence }
 * @returns {Array<object>} une alerte représentative par match_id
 */
function dedupeByMatch(alerts) {
  const byMatch = new Map();
  for (const alert of alerts) {
    const existing = byMatch.get(alert.match_id);
    if (!existing || confidenceRank(alert.confidence) > confidenceRank(existing.confidence)) {
      byMatch.set(alert.match_id, alert);
    }
  }
  return [...byMatch.values()];
}

module.exports = {
  LG1_OFFSET_SEC,
  LG2_OFFSET_SEC,
  WINDOW_WIDTH_SEC,
  computeKickoffWindow,
  isInLiveWindow,
  matchesFamily,
  confidenceRank,
  dedupeByMatch,
};
