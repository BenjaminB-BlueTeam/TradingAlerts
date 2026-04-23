import { describe, it, expect } from 'vitest';
import {
  analyserStreakFHG,
  analyzeScenarioA, analyzeScenarioB,
  computeStreak, confirmationRate, isH2HCleanSheetFirstHalf,
  teamScored31to45, teamConceded31to45, teamScoredInFirstHalf, teamConcededInFirstHalf,
  getTimerConseille, calculerScoreDC,
  STREAK_FORT, STREAK_MOYEN, CONFIRM_WINDOW, CONFIRM_MIN_COUNT, STREAK_MIN_MATCHES,
} from './scoring.js';

// --- Factory helpers ---

function makeMatch({ homeId = 100, awayId = 200, homeGoals = 1, awayGoals = 0, goalEvents = [] } = {}) {
  return {
    home_team_id: homeId,
    away_team_id: awayId,
    home_goals: homeGoals,
    away_goals: awayGoals,
    goal_events: goalEvents,
    match_date: '2026-01-01',
  };
}

function goal(min, home = true) { return { min, raw: String(min), home }; }

// Helpers pour construire des séries rapides
function homeMatches31to45(n) {
  return Array(n).fill(null).map(() => makeMatch({ goalEvents: [goal(35, true)] }));
}
function oppConcedesHalf(n) {
  // adversaire (200, away) encaisse en 1MT : makeMatch default home=100, goal(20, true) = home team marque = 200 encaisse
  return Array(n).fill(null).map(() => makeMatch({ goalEvents: [goal(20, true)] }));
}

// =============================================================
// teamScored31to45
// =============================================================

describe('teamScored31to45 (ESM)', () => {
  it('retourne true pour un but à 35 (home)', () => {
    expect(teamScored31to45(makeMatch({ goalEvents: [goal(35, true)] }), 100)).toBe(true);
  });
  it('retourne true pour un but à 31 (borne inf)', () => {
    expect(teamScored31to45(makeMatch({ goalEvents: [goal(31, true)] }), 100)).toBe(true);
  });
  it('retourne true pour un but à 45 (borne sup)', () => {
    expect(teamScored31to45(makeMatch({ goalEvents: [goal(45, true)] }), 100)).toBe(true);
  });
  it('retourne false pour un but à 30 (hors fenêtre)', () => {
    expect(teamScored31to45(makeMatch({ goalEvents: [goal(30, true)] }), 100)).toBe(false);
  });
  it('retourne false si c\'est un but adverse (home=false)', () => {
    expect(teamScored31to45(makeMatch({ goalEvents: [goal(35, false)] }), 100)).toBe(false);
  });
  it('retourne false si goal_events vide', () => {
    expect(teamScored31to45(makeMatch({ goalEvents: [] }), 100)).toBe(false);
  });
  it('retourne false si goal_events absent', () => {
    expect(teamScored31to45({ home_team_id: 100, away_team_id: 200 }, 100)).toBe(false);
  });
});

// =============================================================
// computeStreak (ESM)
// =============================================================

describe('computeStreak (ESM)', () => {
  it('retourne 0 si liste vide', () => {
    expect(computeStreak([], () => true)).toBe(0);
  });
  it('retourne 0 si premier match échoue', () => {
    const matches = [makeMatch({ goalEvents: [] }), ...homeMatches31to45(3)];
    expect(computeStreak(matches, m => teamScored31to45(m, 100))).toBe(0);
  });
  it('compte streak de 3', () => {
    expect(computeStreak(homeMatches31to45(3), m => teamScored31to45(m, 100))).toBe(3);
  });
  it('s\'arrête au premier échec', () => {
    const matches = [
      ...homeMatches31to45(2),
      makeMatch({ goalEvents: [] }),
      ...homeMatches31to45(2),
    ];
    expect(computeStreak(matches, m => teamScored31to45(m, 100))).toBe(2);
  });
});

// =============================================================
// confirmationRate (ESM)
// =============================================================

describe('confirmationRate (ESM)', () => {
  it('retourne rate 0 si tableau vide', () => {
    const r = confirmationRate([], 5, () => true);
    expect(r.rate).toBe(0);
    expect(r.total).toBe(0);
  });
  it('calcule 3/5 correctement', () => {
    const matches = [
      makeMatch({ goalEvents: [goal(20, false)] }),
      makeMatch({ goalEvents: [goal(20, false)] }),
      makeMatch({ goalEvents: [] }),
      makeMatch({ goalEvents: [goal(20, false)] }),
      makeMatch({ goalEvents: [] }),
    ];
    const r = confirmationRate(matches, 5, m => teamConcededInFirstHalf(m, 100));
    expect(r.rate).toBeCloseTo(0.6);
    expect(r.count).toBe(3);
  });
  it('utilise au plus windowSize matchs', () => {
    // team 100 (home) encaisse si e.home === false
    const matches = [
      makeMatch({ goalEvents: [goal(20, false)] }),
      makeMatch({ goalEvents: [goal(20, false)] }),
      makeMatch({ goalEvents: [goal(20, false)] }),
      makeMatch({ goalEvents: [] }),
      makeMatch({ goalEvents: [] }),
    ];
    const r = confirmationRate(matches, 3, m => teamConcededInFirstHalf(m, 100));
    expect(r.total).toBe(3);
    expect(r.rate).toBe(1);
  });
});

// =============================================================
// isH2HCleanSheetFirstHalf (ESM)
// =============================================================

describe('isH2HCleanSheetFirstHalf (ESM)', () => {
  it('retourne false si < 3 H2H', () => {
    expect(isH2HCleanSheetFirstHalf([makeMatch(), makeMatch()], 100)).toBe(false);
  });
  it('retourne true si 3 H2H et équipe ne marque jamais en 1MT', () => {
    const h2h = Array(3).fill(null).map(() => makeMatch({ goalEvents: [goal(20, false)] }));
    expect(isH2HCleanSheetFirstHalf(h2h, 100)).toBe(true);
  });
  it('retourne false si équipe marque en 1MT dans au moins 1 H2H', () => {
    const h2h = [
      makeMatch({ goalEvents: [goal(20, true)] }),
      makeMatch({ goalEvents: [] }),
      makeMatch({ goalEvents: [] }),
    ];
    expect(isH2HCleanSheetFirstHalf(h2h, 100)).toBe(false);
  });
});

// =============================================================
// analyzeScenarioA (ESM)
// =============================================================

describe('analyzeScenarioA (ESM)', () => {
  it('retourne null si < STREAK_MIN_MATCHES matchs équipe', () => {
    expect(analyzeScenarioA(homeMatches31to45(2), 100, oppConcedesHalf(5), 200)).toBeNull();
  });
  it('confidence null si streak < STREAK_FORT (=3)', () => {
    const teamMatches = [makeMatch({ goalEvents: [] }), ...homeMatches31to45(3)];
    const r = analyzeScenarioA(teamMatches, 100, oppConcedesHalf(5), 200);
    expect(r.confidence).toBeNull();
    expect(r.streakScored).toBe(0);
  });
  it('confidence null si streak 2 (inférieur au minimum de 3)', () => {
    const teamMatches = [...homeMatches31to45(2), makeMatch({ goalEvents: [] })];
    const opp = Array(5).fill(null).map(() => makeMatch({ goalEvents: [goal(20, true)] }));
    const r = analyzeScenarioA(teamMatches, 100, opp, 200);
    expect(r.confidence).toBeNull();
    expect(r.streakScored).toBe(2);
  });
  it('confidence fort si streak >= 3 + adversaire encaisse >= 1 sur les 3 derniers', () => {
    const opp = [
      makeMatch({ goalEvents: [goal(20, true)] }), // 200 encaisse en 1MT
      makeMatch({ goalEvents: [] }),
      makeMatch({ goalEvents: [] }),
    ];
    const r = analyzeScenarioA(homeMatches31to45(4), 100, opp, 200);
    expect(r.confidence).toBe('fort');
    expect(r.streakScored).toBe(4);
    expect(r.oppConcedesCount).toBe(1);
  });
  it('confidence null si adversaire n\'encaisse jamais en 1MT sur les 3 derniers', () => {
    const opp = Array(3).fill(null).map(() => makeMatch({ goalEvents: [] }));
    const r = analyzeScenarioA(homeMatches31to45(4), 100, opp, 200);
    expect(r.confidence).toBeNull();
    expect(r.oppConcedesCount).toBe(0);
  });
});

// =============================================================
// analyzeScenarioB (ESM)
// =============================================================

describe('analyzeScenarioB (ESM)', () => {
  it('retourne null si < STREAK_MIN_MATCHES matchs adversaire', () => {
    expect(analyzeScenarioB(homeMatches31to45(2), 200, homeMatches31to45(5), 100)).toBeNull();
  });
  it('confidence null si streak consécutif encaissé < 3', () => {
    // Adversaire encaisse en 31-45 dans seulement 2 matchs consécutifs (cassé au 3e)
    const opp = [
      makeMatch({ goalEvents: [goal(35, true)] }),
      makeMatch({ goalEvents: [goal(35, true)] }),
      makeMatch({ goalEvents: [] }),  // cassé
      makeMatch({ goalEvents: [goal(35, true)] }),
    ];
    const team = Array(3).fill(null).map(() => makeMatch({ goalEvents: [goal(20, true)] }));
    const r = analyzeScenarioB(opp, 200, team, 100);
    expect(r.confidence).toBeNull();
    expect(r.streakConceded).toBe(2);
  });
  it('confidence moyen si streak consécutif >= 3 + équipe marque >= 1 sur les 3 derniers', () => {
    const opp = Array(4).fill(null).map(() => makeMatch({ goalEvents: [goal(35, true)] }));
    const team = [
      makeMatch({ goalEvents: [goal(20, true)] }), // 100 marque en 1MT
      makeMatch({ goalEvents: [] }),
      makeMatch({ goalEvents: [] }),
    ];
    const r = analyzeScenarioB(opp, 200, team, 100);
    expect(r.confidence).toBe('moyen');
    expect(r.streakConceded).toBe(4);
    expect(r.teamScoresCount).toBe(1);
  });
  it('confidence null si équipe ne marque jamais en 1MT sur les 3 derniers', () => {
    const opp = Array(4).fill(null).map(() => makeMatch({ goalEvents: [goal(35, true)] }));
    const team = Array(3).fill(null).map(() => makeMatch({ goalEvents: [] }));
    const r = analyzeScenarioB(opp, 200, team, 100);
    expect(r.confidence).toBeNull();
    expect(r.teamScoresCount).toBe(0);
  });
});

// =============================================================
// analyserStreakFHG (ESM) — orchestration
// =============================================================

describe('analyserStreakFHG (ESM)', () => {
  it('veto H2H — retourne isAlert false si cleanSheetBlock', () => {
    const h2h = Array(3).fill(null).map(() => makeMatch({ goalEvents: [goal(35, false)] }));
    const r = analyserStreakFHG(homeMatches31to45(4), 100, [], 200, h2h);
    expect(r.isAlert).toBe(false);
    expect(r.cleanSheetBlock).toBe(true);
  });

  it('A seul → signalType FHG_A', () => {
    const teamMatches = homeMatches31to45(4);
    const opp = Array(5).fill(null).map(() => makeMatch({ goalEvents: [goal(20, true)] }));
    const r = analyserStreakFHG(teamMatches, 100, opp, 200, []);
    expect(r.isAlert).toBe(true);
    expect(r.signalType).toBe('FHG_A');
  });

  it('A+B actifs → FHG_A+B avec fort_double', () => {
    const teamMatches = homeMatches31to45(4);
    const oppMatches = Array(4).fill(null).map(() => makeMatch({ goalEvents: [goal(35, true)] }));
    const r = analyserStreakFHG(teamMatches, 100, oppMatches, 200, []);
    // A : streakScored=4 ✓, confirmation (200 encaisse en 1MT) = oppMatches goal(35,true) -> 200 n'est pas home -> e.home !== false -> true -> 4/4 ✓
    // B : countConceded=4 (200 encaisse en 31-45 dans oppMatches) ✓, confirmation (100 marque en 1MT) = teamMatches goal(35,true) -> 4/4 ✓
    expect(r.isAlert).toBe(true);
    expect(r.signalType).toBe('FHG_A+B');
    expect(r.confidence).toBe('fort_double');
  });

  it('rien d\'actif → isAlert false', () => {
    const teamMatches = Array(4).fill(null).map(() => makeMatch({ goalEvents: [] }));
    const oppMatches = Array(4).fill(null).map(() => makeMatch({ goalEvents: [] }));
    const r = analyserStreakFHG(teamMatches, 100, oppMatches, 200, []);
    expect(r.isAlert).toBe(false);
  });

  it('retourne cleanSheetBlock undefined si pas de veto', () => {
    const r = analyserStreakFHG([], 100, [], 200, []);
    expect(r.cleanSheetBlock).toBeUndefined();
  });
});

// =============================================================
// getTimerConseille (inchangé)
// =============================================================

describe('getTimerConseille', () => {
  it('retourne les valeurs débutant', () => {
    const t = getTimerConseille('debutant');
    expect(t.min).toBe(5);
    expect(t.max).toBe(10);
  });
  it('retourne les valeurs expert', () => {
    const t = getTimerConseille('expert');
    expect(t.min).toBe(25);
  });
  it('retourne intermédiaire par défaut', () => {
    const t = getTimerConseille('intermediaire');
    expect(t.min).toBe(15);
    expect(t.max).toBe(20);
  });
  it('retourne intermédiaire pour profil inconnu', () => {
    const t = getTimerConseille('inconnu');
    expect(t.min).toBe(15);
  });
});

// =============================================================
// Constantes exportées
// =============================================================

describe('constantes streak v2', () => {
  it('STREAK_FORT vaut 3', () => expect(STREAK_FORT).toBe(3));
  it('STREAK_MOYEN vaut 2', () => expect(STREAK_MOYEN).toBe(2));
  it('CONFIRM_WINDOW vaut 3', () => expect(CONFIRM_WINDOW).toBe(3));
  it('CONFIRM_MIN_COUNT vaut 1', () => expect(CONFIRM_MIN_COUNT).toBe(1));
  it('STREAK_MIN_MATCHES vaut 3', () => expect(STREAK_MIN_MATCHES).toBe(3));
});
