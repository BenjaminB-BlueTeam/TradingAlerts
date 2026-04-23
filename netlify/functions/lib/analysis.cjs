/* ================================================
   netlify/functions/lib/analysis.cjs
   Fonctions d'analyse FHG (streak v2) et DC.
   Utilisé par generate-alerts.js et testable indépendamment.
   ================================================ */

const DC_MIN_MATCHES = 5;
const DC_SEUIL_MOYEN = 30;
const DC_SEUIL_FORT = 20;

function analyzeDCFromH2H(h2h, homeId) {
  if (h2h.length < DC_MIN_MATCHES) return null;

  let homeLosses = 0, awayLosses = 0;
  for (const m of h2h) {
    const hg = m.home_goals ?? 0;
    const ag = m.away_goals ?? 0;
    const isHome = m.home_team_id === homeId;
    if (hg > ag) {          // H2H home side won
      if (!isHome) homeLosses++;   // homeId was away in this H2H, so homeId lost
      else awayLosses++;           // awayId was away in this H2H, so awayId lost
    } else if (ag > hg) {   // H2H away side won
      if (isHome) homeLosses++;    // homeId was home in this H2H, still lost
      else awayLosses++;           // awayId was home in this H2H, still lost
    }
  }

  const total = h2h.length;
  const homeDefeatPct = Math.round((homeLosses / total) * 100);
  const awayDefeatPct = Math.round((awayLosses / total) * 100);
  const bestSide = homeDefeatPct <= awayDefeatPct ? 'home' : 'away';
  const bestDefeatPct = Math.min(homeDefeatPct, awayDefeatPct);
  const confidence = bestDefeatPct <= DC_SEUIL_FORT ? 'fort' : bestDefeatPct <= DC_SEUIL_MOYEN ? 'moyen' : null;

  return {
    isAlert: confidence !== null,
    confidence,
    bestSide,
    bestDefeatPct,
    h2hCount: total,
  };
}

// ============================================================
// ALGO FHG v2 — Logique streak
// ============================================================

const STREAK_FORT = 3;
const STREAK_MOYEN = 2;
const CONFIRM_WINDOW = 3;    // fenêtre de confirmation : 3 derniers matchs
const CONFIRM_MIN_COUNT = 1; // minimum 1 match de confirmation sur les 3 derniers
const STREAK_MIN_MATCHES = 3;

// --- Helpers événements ---

function teamScored31to45(match, teamId) {
  const events = Array.isArray(match.goal_events) ? match.goal_events : [];
  const teamIsHome = match.home_team_id === teamId;
  return events.some(e => e.min >= 31 && e.min <= 45 && e.home === teamIsHome);
}

function teamConceded31to45(match, teamId) {
  const events = Array.isArray(match.goal_events) ? match.goal_events : [];
  const teamIsHome = match.home_team_id === teamId;
  return events.some(e => e.min >= 31 && e.min <= 45 && e.home !== teamIsHome);
}

function teamScoredInFirstHalf(match, teamId) {
  const events = Array.isArray(match.goal_events) ? match.goal_events : [];
  const teamIsHome = match.home_team_id === teamId;
  return events.some(e => e.min <= 45 && e.home === teamIsHome);
}

function teamConcededInFirstHalf(match, teamId) {
  const events = Array.isArray(match.goal_events) ? match.goal_events : [];
  const teamIsHome = match.home_team_id === teamId;
  return events.some(e => e.min <= 45 && e.home !== teamIsHome);
}

// --- Core ---

/**
 * Compte le streak consécutif depuis le plus récent match.
 * matches DOIT être trié DESC par match_date.
 */
function computeStreak(matches, eventCheckFn) {
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
function confirmationRate(matches, windowSize, checkFn) {
  const sample = matches.slice(0, windowSize);
  if (sample.length === 0) return { rate: 0, count: 0, total: 0 };
  const count = sample.filter(checkFn).length;
  return { rate: count / sample.length, count, total: sample.length };
}

// --- Veto H2H ---

/**
 * Si H2H (même config dom/ext) >= 3 et team n'a jamais marqué en 1MT → veto.
 * teamIsHome : true = l'équipe joue dom dans le match à venir (filtre H2H où elle était dom)
 *              false = l'équipe joue ext (filtre H2H où elle était ext)
 *              null = aucun filtre (ancien comportement)
 */
function isH2HCleanSheetFirstHalf(h2h, teamId, teamIsHome = null) {
  const filtered = teamIsHome === null
    ? h2h
    : h2h.filter(m => teamIsHome ? m.home_team_id === teamId : m.away_team_id === teamId);
  if (filtered.length < 3) return false;
  const scoredCount = filtered.filter(m => teamScoredInFirstHalf(m, teamId)).length;
  return scoredCount === 0;
}

// --- Scénarios ---

// Scénario C : streak court (>=2) + confirmation très forte (3/3 adversaire encaisse en 1MT)
function analyzeScenarioC(teamMatches, teamId, opponentMatches, opponentId) {
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
function analyzeScenarioD(teamMatches, teamId, opponentMatches, opponentId) {
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

function analyzeScenarioA(teamMatches, teamId, opponentMatches, opponentId) {
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

function analyzeScenarioB(opponentMatches, opponentId, teamMatches, teamId) {
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

// --- Orchestration ---

/**
 * Analyse streak FHG pour une équipe ciblée.
 * Retourne { isAlert, signalType, confidence, factors, cleanSheetBlock }.
 *
 * @param {Array}   teamMatches      matchs de l'équipe dans le contexte (home OU away), triés DESC
 * @param {number}  teamId           id de l'équipe ciblée
 * @param {Array}   opponentMatches  matchs de l'adversaire dans le contexte OPPOSÉ, triés DESC
 * @param {number}  opponentId       id de l'adversaire
 * @param {Array}   h2h              H2H entre les deux équipes (toutes configs)
 * @param {boolean|null} teamIsHome  true=dom, false=ext — filtre le veto H2H par config
 */
function analyzeStreakAlert(teamMatches, teamId, opponentMatches, opponentId, h2h, teamIsHome = null) {
  // Veto H2H filtré par configuration domicile/extérieur
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

module.exports = {
  // DC (inchangé)
  analyzeDCFromH2H,
  DC_MIN_MATCHES,
  DC_SEUIL_MOYEN,
  DC_SEUIL_FORT,
  // FHG streak v2
  analyzeStreakAlert,
  analyzeScenarioA,
  analyzeScenarioB,
  analyzeScenarioC,
  analyzeScenarioD,
  computeStreak,
  confirmationRate,
  isH2HCleanSheetFirstHalf,
  teamScored31to45,
  teamConceded31to45,
  teamScoredInFirstHalf,
  teamConcededInFirstHalf,
  STREAK_FORT,
  STREAK_MOYEN,
  CONFIRM_WINDOW,
  CONFIRM_MIN_COUNT,
  STREAK_MIN_MATCHES,
};
