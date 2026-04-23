/* ================================================
   src/lib/core/lg2.js
   Algo LG2 — Late Goal 2e mi-temps (>= 80').
   Miroir ESM de netlify/functions/lib/lg2.cjs pour le front-end.
   ================================================ */

export const LG2_MIN_MINUTE = 80;
export const LG2_STREAK_MIN_MATCHES = 3;
export const LG2_STREAK_MOYEN = 3;
export const LG2_STREAK_FORT = 4;

export function matchHasGoalAfter80(match) {
  const events = Array.isArray(match?.goal_events) ? match.goal_events : [];
  return events.some(e => typeof e?.min === 'number' && e.min >= LG2_MIN_MINUTE);
}

/**
 * Compte le streak consécutif depuis le plus récent match.
 * `matches` doit être trié DESC par match_date.
 */
export function computeLG2Streak(matches) {
  if (!Array.isArray(matches)) return 0;
  let streak = 0;
  for (const m of matches) {
    if (matchHasGoalAfter80(m)) streak++;
    else break;
  }
  return streak;
}

export function classifyConfidence(streak) {
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
export function analyzeLG2(homeMatches, awayMatches) {
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
