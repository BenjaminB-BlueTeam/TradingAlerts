/* ================================================
   scoring.js — Logique FHG streak v2 (ESM) + DC + timer
   FHG Tracker — miroir ESM de analysis.cjs côté backend
   ================================================ */

// ============================================================
// ALGO FHG v2 — Logique streak (ESM, miroir de analysis.cjs)
// ============================================================

export const STREAK_FORT = 3;
export const STREAK_MOYEN = 2;
export const CONFIRM_MIN_RATE = 0.60;
export const CONFIRM_WINDOW = 5;
export const CONFIRM_MIN_SAMPLE = 3;
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

export function analyzeScenarioA(teamMatches, teamId, opponentMatches, opponentId) {
  if (teamMatches.length < STREAK_MIN_MATCHES) return null;

  // Scénario A : l'équipe marque en 31-45 sur STREAK_FORT matchs CONSÉCUTIFS
  const streakScored = computeStreak(teamMatches, m => teamScored31to45(m, teamId));
  const oppConcedes = confirmationRate(
    opponentMatches,
    CONFIRM_WINDOW,
    m => teamConcededInFirstHalf(m, opponentId)
  );

  const confirmOK = oppConcedes.rate >= CONFIRM_MIN_RATE && oppConcedes.total >= CONFIRM_MIN_SAMPLE;
  let confidence = null;
  if (streakScored >= STREAK_FORT && confirmOK) confidence = 'fort';

  return {
    scenario: 'A',
    confidence,
    streakScored,
    oppConcedesRate: Math.round(oppConcedes.rate * 100),
    oppConcedesSample: `${oppConcedes.count}/${oppConcedes.total}`,
  };
}

export function analyzeScenarioB(opponentMatches, opponentId, teamMatches, teamId) {
  if (opponentMatches.length < STREAK_MIN_MATCHES) return null;

  // Scénario B : l'adversaire a encaissé en 31-45 dans au moins STREAK_FORT
  // des CONFIRM_WINDOW derniers matchs (non nécessairement consécutifs)
  const window = opponentMatches.slice(0, CONFIRM_WINDOW);
  const countConceded = window.filter(m => teamConceded31to45(m, opponentId)).length;
  const teamScores = confirmationRate(
    teamMatches,
    CONFIRM_WINDOW,
    m => teamScoredInFirstHalf(m, teamId)
  );

  const confirmOK = teamScores.rate >= CONFIRM_MIN_RATE && teamScores.total >= CONFIRM_MIN_SAMPLE;
  let confidence = null;
  if (countConceded >= STREAK_FORT && confirmOK) confidence = 'moyen';

  return {
    scenario: 'B',
    confidence,
    countConceded,
    teamScoresRate: Math.round(teamScores.rate * 100),
    teamScoresSample: `${teamScores.count}/${teamScores.total}`,
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

  if (!aActive && !bActive) return { isAlert: false };

  if (aActive && bActive) {
    return {
      isAlert: true,
      signalType: 'FHG_A+B',
      confidence: 'fort_double',
      factors: { scenarioA: a, scenarioB: b },
    };
  }

  const best = aActive ? a : b;
  return {
    isAlert: true,
    signalType: best.scenario === 'A' ? 'FHG_A' : 'FHG_B',
    confidence: best.confidence,
    factors: best,
  };
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
