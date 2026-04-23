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
const CONFIRM_MIN_RATE = 0.60;
const CONFIRM_WINDOW = 5;
const CONFIRM_MIN_SAMPLE = 3;
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
 * Si H2H >= 3 et team n'a jamais marqué en 1MT (0-45) dans ces H2H → veto.
 * Pas de filtre par configuration home/away.
 */
function isH2HCleanSheetFirstHalf(h2h, teamId) {
  if (h2h.length < 3) return false;
  const scoredCount = h2h.filter(m => teamScoredInFirstHalf(m, teamId)).length;
  return scoredCount === 0;
}

// --- Scénarios ---

function analyzeScenarioA(teamMatches, teamId, opponentMatches, opponentId) {
  if (teamMatches.length < STREAK_MIN_MATCHES) return null;

  const streakScored = computeStreak(teamMatches, m => teamScored31to45(m, teamId));
  const oppConcedes = confirmationRate(
    opponentMatches,
    CONFIRM_WINDOW,
    m => teamConcededInFirstHalf(m, opponentId)
  );

  const principalFort = streakScored >= STREAK_FORT;
  const principalMoyen = streakScored >= STREAK_MOYEN;
  const confirmOK = oppConcedes.rate >= CONFIRM_MIN_RATE && oppConcedes.total >= CONFIRM_MIN_SAMPLE;

  let confidence = null;
  if (principalFort && confirmOK) confidence = 'fort';
  else if (principalMoyen && confirmOK) confidence = 'moyen';

  return {
    scenario: 'A',
    confidence,
    streakScored,
    oppConcedesRate: Math.round(oppConcedes.rate * 100),
    oppConcedesSample: `${oppConcedes.count}/${oppConcedes.total}`,
  };
}

function analyzeScenarioB(opponentMatches, opponentId, teamMatches, teamId) {
  if (opponentMatches.length < STREAK_MIN_MATCHES) return null;

  const streakConceded = computeStreak(opponentMatches, m => teamConceded31to45(m, opponentId));
  const teamScores = confirmationRate(
    teamMatches,
    CONFIRM_WINDOW,
    m => teamScoredInFirstHalf(m, teamId)
  );

  const principalFort = streakConceded >= STREAK_FORT;
  const principalMoyen = streakConceded >= STREAK_MOYEN;
  const confirmOK = teamScores.rate >= CONFIRM_MIN_RATE && teamScores.total >= CONFIRM_MIN_SAMPLE;

  let confidence = null;
  if (principalFort && confirmOK) confidence = 'fort';
  else if (principalMoyen && confirmOK) confidence = 'moyen';

  return {
    scenario: 'B',
    confidence,
    streakConceded,
    teamScoresRate: Math.round(teamScores.rate * 100),
    teamScoresSample: `${teamScores.count}/${teamScores.total}`,
  };
}

// --- Orchestration ---

/**
 * Analyse streak FHG pour une équipe ciblée.
 * Retourne { isAlert, signalType, confidence, factors, cleanSheetBlock }.
 *
 * @param {Array}  teamMatches      matchs de l'équipe dans le contexte (home OU away), triés DESC
 * @param {number} teamId           id de l'équipe ciblée
 * @param {Array}  opponentMatches  matchs de l'adversaire dans le contexte OPPOSÉ, triés DESC
 * @param {number} opponentId       id de l'adversaire
 * @param {Array}  h2h              H2H entre les deux équipes (non filtré par config)
 */
function analyzeStreakAlert(teamMatches, teamId, opponentMatches, opponentId, h2h) {
  // Veto H2H (global, pas filtré par config)
  if (isH2HCleanSheetFirstHalf(h2h, teamId)) {
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
  computeStreak,
  confirmationRate,
  isH2HCleanSheetFirstHalf,
  teamScored31to45,
  teamConceded31to45,
  teamScoredInFirstHalf,
  teamConcededInFirstHalf,
  STREAK_FORT,
  STREAK_MOYEN,
  CONFIRM_MIN_RATE,
  CONFIRM_WINDOW,
  CONFIRM_MIN_SAMPLE,
  STREAK_MIN_MATCHES,
};
