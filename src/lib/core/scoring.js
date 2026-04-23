/* ================================================
   scoring.js — Logique FHG streak v2 (ESM) + DC + timer
   FHG Tracker — miroir ESM de analysis.cjs côté backend
   ================================================ */

// ============================================================
// ALGO FHG v2 — Logique streak (ESM, miroir de analysis.cjs)
// ============================================================

export const STREAK_FORT = 3;
export const STREAK_MOYEN = 2;
export const CONFIRM_WINDOW = 3;    // fenêtre de confirmation : 3 derniers matchs
export const CONFIRM_MIN_COUNT = 1; // minimum 1 match de confirmation sur les 3 derniers
export const STREAK_MIN_MATCHES = 3;

// --- Helpers événements ---

export function teamScored31to45(match, teamId) {
  const events = Array.isArray(match.goal_events) ? match.goal_events : [];
  const teamIsHome = match.home_team_id === teamId;
  return events.some(e => e.min >= 31 && e.min <= 45 && e.home === teamIsHome);
}

export function teamConceded31to45(match, teamId) {
  const events = Array.isArray(match.goal_events) ? match.goal_events : [];
  const teamIsHome = match.home_team_id === teamId;
  return events.some(e => e.min >= 31 && e.min <= 45 && e.home !== teamIsHome);
}

export function teamScoredInFirstHalf(match, teamId) {
  const events = Array.isArray(match.goal_events) ? match.goal_events : [];
  const teamIsHome = match.home_team_id === teamId;
  return events.some(e => e.min <= 45 && e.home === teamIsHome);
}

export function teamConcededInFirstHalf(match, teamId) {
  const events = Array.isArray(match.goal_events) ? match.goal_events : [];
  const teamIsHome = match.home_team_id === teamId;
  return events.some(e => e.min <= 45 && e.home !== teamIsHome);
}

// --- Core ---

/**
 * Compte le streak consécutif depuis le plus récent match.
 * matches DOIT être trié DESC par match_date.
 */
export function computeStreak(matches, eventCheckFn) {
  let streak = 0;
  for (const m of matches) {
    if (eventCheckFn(m)) streak++;
    else break;
  }
  return streak;
}

/**
 * Taux de succès sur une fenêtre (N plus récents matchs).
 */
export function confirmationRate(matches, windowSize, checkFn) {
  const sample = matches.slice(0, windowSize);
  if (sample.length === 0) return { rate: 0, count: 0, total: 0 };
  const count = sample.filter(checkFn).length;
  return { rate: count / sample.length, count, total: sample.length };
}

// --- Veto H2H ---

/**
 * Si H2H (même config dom/ext) >= 3 et équipe n'a jamais marqué en 1MT → veto.
 * teamIsHome : true=dom, false=ext, null=toutes configs (ancien comportement)
 */
export function isH2HCleanSheetFirstHalf(h2h, teamId, teamIsHome = null) {
  const filtered = teamIsHome === null
    ? h2h
    : h2h.filter(m => teamIsHome ? m.home_team_id === teamId : m.away_team_id === teamId);
  if (filtered.length < 3) return false;
  const scoredCount = filtered.filter(m => teamScoredInFirstHalf(m, teamId)).length;
  return scoredCount === 0;
}

// --- Scénarios ---

// Scénario C : streak court (>=2) + confirmation très forte (3/3 adversaire encaisse en 1MT)
export function analyzeScenarioC(teamMatches, teamId, opponentMatches, opponentId) {
  if (teamMatches.length < STREAK_MIN_MATCHES) return null;

  const streakScored = computeStreak(teamMatches, m => teamScored31to45(m, teamId));
  const window = opponentMatches.slice(0, CONFIRM_WINDOW);
  const oppConcedesCount = window.filter(m => teamConcededInFirstHalf(m, opponentId)).length;

  // Streak 2 exactement (si >=3, scénario A aurait dû déclencher)
  const principalOK = streakScored === STREAK_MOYEN;
  // Confirmation forte : 3/3 (tout le CONFIRM_WINDOW)
  const confirmOK = window.length >= CONFIRM_WINDOW && oppConcedesCount >= CONFIRM_WINDOW;
  let confidence = null;
  if (principalOK && confirmOK) confidence = 'moyen';

  return {
    scenario: 'C',
    confidence,
    streakScored,
    oppConcedesCount,
    oppConcedesWindow: window.length,
  };
}

// Scénario D : double activité 31-45 (marque ET encaisse) + adversaire marque en 1MT
export function analyzeScenarioD(teamMatches, teamId, opponentMatches, opponentId) {
  if (teamMatches.length < STREAK_MIN_MATCHES || opponentMatches.length < STREAK_MIN_MATCHES) return null;

  const recentTeam = teamMatches.slice(0, CONFIRM_WINDOW);
  const scoredCount = recentTeam.filter(m => teamScored31to45(m, teamId)).length;
  const concededCount = recentTeam.filter(m => teamConceded31to45(m, teamId)).length;

  const recentOpp = opponentMatches.slice(0, CONFIRM_WINDOW);
  const oppScoresCount = recentOpp.filter(m => teamScoredInFirstHalf(m, opponentId)).length;

  // L'équipe marque ET encaisse en 31-45 sur les 3 derniers + adversaire marque en 1MT
  const principalOK = scoredCount >= CONFIRM_MIN_COUNT && concededCount >= CONFIRM_MIN_COUNT;
  const confirmOK = oppScoresCount >= CONFIRM_MIN_COUNT;
  let confidence = null;
  if (principalOK && confirmOK) confidence = 'moyen';

  return {
    scenario: 'D',
    confidence,
    scoredCount,
    concededCount,
    oppScoresCount,
    teamWindow: recentTeam.length,
    oppWindow: recentOpp.length,
  };
}

export function analyzeScenarioA(teamMatches, teamId, opponentMatches, opponentId) {
  if (teamMatches.length < STREAK_MIN_MATCHES) return null;

  // Scénario A : l'équipe marque en 31-45 sur STREAK_FORT matchs CONSÉCUTIFS
  const streakScored = computeStreak(teamMatches, m => teamScored31to45(m, teamId));
  const window = opponentMatches.slice(0, CONFIRM_WINDOW);
  const oppConcedesCount = window.filter(m => teamConcededInFirstHalf(m, opponentId)).length;

  const principalOK = streakScored >= STREAK_FORT;
  const confirmOK = oppConcedesCount >= CONFIRM_MIN_COUNT;
  let confidence = null;
  if (principalOK && confirmOK) confidence = 'fort';

  return {
    scenario: 'A',
    confidence,
    streakScored,
    oppConcedesCount,
    oppConcedesWindow: window.length,
  };
}

export function analyzeScenarioB(opponentMatches, opponentId, teamMatches, teamId) {
  if (opponentMatches.length < STREAK_MIN_MATCHES) return null;

  // Scénario B : l'adversaire encaisse en 31-45 sur STREAK_FORT matchs CONSÉCUTIFS
  const streakConceded = computeStreak(opponentMatches, m => teamConceded31to45(m, opponentId));
  const window = teamMatches.slice(0, CONFIRM_WINDOW);
  const teamScoresCount = window.filter(m => teamScoredInFirstHalf(m, teamId)).length;

  const principalOK = streakConceded >= STREAK_FORT;
  const confirmOK = teamScoresCount >= CONFIRM_MIN_COUNT;
  let confidence = null;
  if (principalOK && confirmOK) confidence = 'moyen';

  return {
    scenario: 'B',
    confidence,
    streakConceded,
    teamScoresCount,
    teamScoresWindow: window.length,
  };
}

/**
 * Analyse streak FHG pour une équipe ciblée.
 *
 * @param {Array}        teamMatches      matchs de l'équipe dans son contexte (triés DESC)
 * @param {number}       teamId           id de l'équipe ciblée
 * @param {Array}        opponentMatches  matchs de l'adversaire dans le contexte opposé
 * @param {number}       opponentId       id de l'adversaire
 * @param {Array}        h2h              H2H entre les deux équipes (toutes configs)
 * @param {boolean|null} teamIsHome       true=dom, false=ext — filtre le veto H2H par config
 * @returns {{ isAlert, signalType, confidence, factors, cleanSheetBlock }}
 */
export function analyserStreakFHG(teamMatches, teamId, opponentMatches, opponentId, h2h = [], teamIsHome = null) {
  if (isH2HCleanSheetFirstHalf(h2h, teamId, teamIsHome)) {
    return { isAlert: false, cleanSheetBlock: true };
  }

  const a = analyzeScenarioA(teamMatches, teamId, opponentMatches, opponentId);
  const b = analyzeScenarioB(opponentMatches, opponentId, teamMatches, teamId);

  const aActive = a?.confidence != null;
  const bActive = b?.confidence != null;

  if (aActive && bActive) {
    return {
      isAlert: true,
      signalType: 'FHG_A+B',
      confidence: 'fort_double',
      factors: { scenarioA: a, scenarioB: b },
    };
  }

  if (aActive || bActive) {
    const best = aActive ? a : b;
    return {
      isAlert: true,
      signalType: best.scenario === 'A' ? 'FHG_A' : 'FHG_B',
      confidence: best.confidence,
      factors: best,
    };
  }

  // Scénarios additifs C et D — seulement si A et B n'ont pas déclenché
  const c = analyzeScenarioC(teamMatches, teamId, opponentMatches, opponentId);
  const d = analyzeScenarioD(teamMatches, teamId, opponentMatches, opponentId);
  const cActive = c?.confidence != null;
  const dActive = d?.confidence != null;

  if (cActive || dActive) {
    const best = cActive ? c : d;
    return {
      isAlert: true,
      signalType: best.scenario === 'C' ? 'FHG_C' : 'FHG_D',
      confidence: best.confidence,
      factors: best,
    };
  }

  return { isAlert: false };
}

// ============================================================
// DC (inchangé)
// ============================================================

const FHG_SEUIL_MOYEN = 50; // seuil DC lié au score FHG legacy — à revoir si DC évolue

/**
 * Calcule le score DC pour une équipe, uniquement si FHG validé.
 * @deprecated — DC géré par analyzeDCFromH2H côté serveur désormais
 */
export function calculerScoreDC(equipe, scoreFHG) {
  if (!scoreFHG || scoreFHG < FHG_SEUIL_MOYEN) return null;

  let score = 0;
  score += (equipe.pct_retour_si_encaisse || 0) * 0.40;
  score += (scoreFHG / 100) * 30;
  score += (equipe.pct_victoire_domicile || 0) * 0.20;
  score += (equipe.matches_played || 0) > 10 ? 10 : 0;

  return Math.round(score);
}

// ============================================================
// Timer conseillé (inchangé)
// ============================================================

export function getTimerConseille(profil) {
  switch (profil) {
    case 'debutant':
      return { min: 5,  max: 10,  cote: '~1.50', label: 'Débutant (5-10e, cote ~1.50)' };
    case 'expert':
      return { min: 25, max: 35,  cote: '2.30+', label: 'Expert (25-35e, cote 2.30+)' };
    default:
      return { min: 15, max: 20, cote: '~1.80', label: 'Intermédiaire (15-20e)' };
  }
}
