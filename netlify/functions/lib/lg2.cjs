/* ================================================
   netlify/functions/lib/lg2.cjs
   Algo LG2 — Late Goal 2e mi-temps (>= 80').
   Streak consécutif de matchs avec au moins un but après 80',
   évalué séparément côté domicile et côté extérieur.
   Utilisé par generate-alerts.js.
   ================================================ */

const LG2_MIN_MINUTE = 80;
const LG2_STREAK_MIN_MATCHES = 3;
const LG2_STREAK_MOYEN = 3;
const LG2_STREAK_FORT = 4;

function matchHasGoalAfter80(match) {
  const events = Array.isArray(match?.goal_events) ? match.goal_events : [];
  return events.some(e => typeof e?.min === 'number' && e.min >= LG2_MIN_MINUTE);
}

/**
 * Compte le streak consécutif depuis le plus récent match.
 * `matches` doit être trié DESC par match_date.
 */
function computeLG2Streak(matches) {
  if (!Array.isArray(matches)) return 0;
  let streak = 0;
  for (const m of matches) {
    if (matchHasGoalAfter80(m)) streak++;
    else break;
  }
  return streak;
}

function classifyConfidence(streak) {
  if (streak >= LG2_STREAK_FORT) return 'fort';
  if (streak >= LG2_STREAK_MOYEN) return 'moyen';
  return null;
}

/**
 * Analyse LG2 pour un match à venir Home vs Away.
 *
 * @param {Array} homeMatches — derniers matchs de l'équipe dom, triés DESC, contexte domicile
 * @param {Array} awayMatches — derniers matchs de l'équipe ext, triés DESC, contexte extérieur
 * @returns {{ isAlert, signalType, confidence, factors, reason? }}
 */
function analyzeLG2(homeMatches, awayMatches) {
  const hm = Array.isArray(homeMatches) ? homeMatches : [];
  const am = Array.isArray(awayMatches) ? awayMatches : [];

  if (hm.length < LG2_STREAK_MIN_MATCHES && am.length < LG2_STREAK_MIN_MATCHES) {
    return { isAlert: false, reason: 'insufficient_history', factors: { streakHome: 0, streakAway: 0 } };
  }

  const streakHome = computeLG2Streak(hm);
  const streakAway = computeLG2Streak(am);
  const factors = { streakHome, streakAway };

  const confHome = classifyConfidence(streakHome);
  const confAway = classifyConfidence(streakAway);

  if (confHome && confAway) {
    return {
      isAlert: true,
      signalType: 'LG2_A+B',
      confidence: 'fort_double',
      factors,
    };
  }
  if (confHome) {
    return {
      isAlert: true,
      signalType: 'LG2_A',
      confidence: confHome,
      factors,
    };
  }
  if (confAway) {
    return {
      isAlert: true,
      signalType: 'LG2_B',
      confidence: confAway,
      factors,
    };
  }
  return { isAlert: false, factors };
}

module.exports = {
  LG2_MIN_MINUTE,
  LG2_STREAK_MIN_MATCHES,
  LG2_STREAK_MOYEN,
  LG2_STREAK_FORT,
  matchHasGoalAfter80,
  computeLG2Streak,
  classifyConfidence,
  analyzeLG2,
};
