import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  analyzeDCFromH2H, analyzeFHGFromMatches, MIN_MATCHES,
  // streak v2
  analyzeStreakAlert, analyzeScenarioA, analyzeScenarioB,
  computeStreak, confirmationRate, isH2HCleanSheetFirstHalf,
  teamScored31to45, teamConceded31to45, teamScoredInFirstHalf, teamConcededInFirstHalf,
} = require('./analysis.cjs');

// --- Helper factories ---

function makeH2HMatch({ homeId = 100, awayId = 200, homeGoals = 1, awayGoals = 0, goalEvents = [] } = {}) {
  return {
    home_team_id: homeId,
    away_team_id: awayId,
    home_goals: homeGoals,
    away_goals: awayGoals,
    goal_events: goalEvents,
  };
}

function makeTeamMatch({ homeGoals = 1, awayGoals = 0, homeGoalsHt = 1, awayGoalsHt = 0, goalEvents = [] } = {}) {
  return {
    home_goals: homeGoals,
    away_goals: awayGoals,
    home_goals_ht: homeGoalsHt,
    away_goals_ht: awayGoalsHt,
    goal_events: goalEvents,
  };
}

// ========================
// analyzeDCFromH2H
// ========================

describe('analyzeDCFromH2H', () => {
  it('returns null when fewer than MIN_MATCHES H2H', () => {
    const h2h = [makeH2HMatch(), makeH2HMatch()];
    expect(analyzeDCFromH2H(h2h, 100)).toBeNull();
  });

  it('returns null with exactly MIN_MATCHES - 1', () => {
    const h2h = Array(MIN_MATCHES - 1).fill(null).map(() => makeH2HMatch());
    expect(analyzeDCFromH2H(h2h, 100)).toBeNull();
  });

  it('calculates defeat percentages correctly when homeId always wins at home', () => {
    // 5 matches: homeId=100 is home in all, all home wins (hg > ag)
    // homeLosses = 0 (homeId never lost), awayLosses = 5 (awayId lost all)
    const h2h = Array(5).fill(null).map(() =>
      makeH2HMatch({ homeId: 100, awayId: 200, homeGoals: 2, awayGoals: 0 })
    );
    const result = analyzeDCFromH2H(h2h, 100);

    expect(result).not.toBeNull();
    expect(result.bestSide).toBe('home');
    expect(result.bestDefeatPct).toBe(0);  // homeId has 0% defeat
    expect(result.isAlert).toBe(true);
    expect(result.confidence).toBe('fort'); // 0 <= 20
  });

  it('counts W/L correctly when homeId plays as both home and away', () => {
    // homeId=100:
    //   Match 1: 100 home, 200 away, 100 wins (2-0) => awayLosses++
    //   Match 2: 200 home, 100 away, 200 wins (2-0) => homeLosses++ (100 lost as away)
    //   Match 3: 100 home, 200 away, draw (1-1) => no losses
    //   Match 4: 100 home, 200 away, 100 wins (3-1) => awayLosses++
    //   Match 5: 200 home, 100 away, 100 wins (0-1) => awayLosses++ (200 lost as home)
    const h2h = [
      makeH2HMatch({ homeId: 100, awayId: 200, homeGoals: 2, awayGoals: 0 }),
      makeH2HMatch({ homeId: 200, awayId: 100, homeGoals: 2, awayGoals: 0 }),
      makeH2HMatch({ homeId: 100, awayId: 200, homeGoals: 1, awayGoals: 1 }),
      makeH2HMatch({ homeId: 100, awayId: 200, homeGoals: 3, awayGoals: 1 }),
      makeH2HMatch({ homeId: 200, awayId: 100, homeGoals: 0, awayGoals: 1 }),
    ];
    const result = analyzeDCFromH2H(h2h, 100);

    // homeLosses for homeId=100:
    //   Match 2: 200 home wins (hg>ag), isHome=false => homeLosses++ => 1
    // awayLosses for awayId=200:
    //   Match 1: 100 home wins, isHome=true => awayLosses++ => 1
    //   Match 4: 100 home wins, isHome=true => awayLosses++ => 2
    //   Match 5: 100 away wins (ag>hg), isHome=false => awayLosses++ => 3
    expect(result.bestDefeatPct).toBe(20); // homeLosses = 1/5 = 20%
    expect(result.bestSide).toBe('home');
  });

  it('handles all draws correctly', () => {
    const h2h = Array(5).fill(null).map(() =>
      makeH2HMatch({ homeGoals: 1, awayGoals: 1 })
    );
    const result = analyzeDCFromH2H(h2h, 100);

    expect(result.bestDefeatPct).toBe(0);
    expect(result.isAlert).toBe(true);
    expect(result.confidence).toBe('fort');
  });

  it('returns no alert when defeat pct > 30', () => {
    // homeId=100 loses 3 out of 5 => 60% defeat
    const h2h = [
      makeH2HMatch({ homeId: 100, awayId: 200, homeGoals: 0, awayGoals: 1 }), // homeLoss
      makeH2HMatch({ homeId: 100, awayId: 200, homeGoals: 0, awayGoals: 1 }), // homeLoss
      makeH2HMatch({ homeId: 100, awayId: 200, homeGoals: 0, awayGoals: 1 }), // homeLoss
      makeH2HMatch({ homeId: 200, awayId: 100, homeGoals: 0, awayGoals: 1 }), // awayLoss
      makeH2HMatch({ homeId: 200, awayId: 100, homeGoals: 0, awayGoals: 1 }), // awayLoss
    ];
    const result = analyzeDCFromH2H(h2h, 100);

    // homeLosses = 3 (60%), awayLosses = 2 (40%) => bestDefeat = 40% > 30
    expect(result.bestDefeatPct).toBe(40);
    expect(result.isAlert).toBe(false);
    expect(result.confidence).toBeNull();
  });

  it('returns moyen confidence when defeat pct between 21-30', () => {
    // Need bestDefeatPct in 21-30 range
    // 5 matches, 1 loss for best side => 20% => fort, not moyen
    // 7 matches, 2 losses => 29% => moyen
    const h2h = [
      makeH2HMatch({ homeId: 100, awayId: 200, homeGoals: 2, awayGoals: 0 }),
      makeH2HMatch({ homeId: 100, awayId: 200, homeGoals: 2, awayGoals: 0 }),
      makeH2HMatch({ homeId: 100, awayId: 200, homeGoals: 2, awayGoals: 0 }),
      makeH2HMatch({ homeId: 100, awayId: 200, homeGoals: 0, awayGoals: 1 }), // homeLoss
      makeH2HMatch({ homeId: 200, awayId: 100, homeGoals: 1, awayGoals: 0 }), // homeLoss
      makeH2HMatch({ homeId: 100, awayId: 200, homeGoals: 2, awayGoals: 0 }),
      makeH2HMatch({ homeId: 100, awayId: 200, homeGoals: 2, awayGoals: 0 }),
    ];
    const result = analyzeDCFromH2H(h2h, 100);

    // homeLosses = 2, awayLosses = 5 => bestDefeatPct = round(2/7*100) = 29%
    expect(result.bestDefeatPct).toBe(29);
    expect(result.confidence).toBe('moyen');
    expect(result.isAlert).toBe(true);
  });

  it('returns correct h2hCount', () => {
    const h2h = Array(8).fill(null).map(() => makeH2HMatch());
    const result = analyzeDCFromH2H(h2h, 100);
    expect(result.h2hCount).toBe(8);
  });
});

// ========================
// STREAK V2 helpers
// ========================

// Factory helpers streak
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

// Helper: N matchs où l'équipe 100 (home) a marqué à la min donnée
function homeMatches31to45(n) {
  return Array(n).fill(null).map(() => makeMatch({ goalEvents: [goal(35, true)] }));
}
// Helper: N matchs où l'adversaire 200 (away) encaisse en 1MT
function oppConcedesHalf(n) {
  return Array(n).fill(null).map(() =>
    makeMatch({ homeId: 200, awayId: 300, goalEvents: [goal(20, true)] }) // 200 encaisse (home:false = adversaire du 200)
  );
}

// --- teamScored31to45 ---
describe('teamScored31to45', () => {
  it('retourne true pour un but à 31', () => {
    const m = makeMatch({ goalEvents: [goal(31, true)] });
    expect(teamScored31to45(m, 100)).toBe(true);
  });
  it('retourne true pour un but à 45', () => {
    const m = makeMatch({ goalEvents: [goal(45, true)] });
    expect(teamScored31to45(m, 100)).toBe(true);
  });
  it('retourne false pour un but à 30 (hors fenêtre)', () => {
    const m = makeMatch({ goalEvents: [goal(30, true)] });
    expect(teamScored31to45(m, 100)).toBe(false);
  });
  it('retourne false pour un but à 46 (hors fenêtre)', () => {
    const m = makeMatch({ goalEvents: [goal(46, true)] });
    expect(teamScored31to45(m, 100)).toBe(false);
  });
  it('retourne false si c\'est un but de l\'adversaire', () => {
    const m = makeMatch({ goalEvents: [goal(35, false)] }); // home=false = but de l'équipe away
    expect(teamScored31to45(m, 100)).toBe(false); // 100 est home, n'a pas marqué
  });
  it('retourne false pour des goal_events vides', () => {
    const m = makeMatch({ goalEvents: [] });
    expect(teamScored31to45(m, 100)).toBe(false);
  });
  it('retourne false pour goal_events absent (undefined)', () => {
    const m = { home_team_id: 100, away_team_id: 200 };
    expect(teamScored31to45(m, 100)).toBe(false);
  });
});

// --- teamConcededInFirstHalf ---
describe('teamConcededInFirstHalf', () => {
  it('retourne true si l\'adversaire marque avant 45', () => {
    // 100 est home, goal adverse = home:false
    const m = makeMatch({ goalEvents: [goal(20, false)] });
    expect(teamConcededInFirstHalf(m, 100)).toBe(true);
  });
  it('retourne false si l\'équipe encaisse après 45', () => {
    const m = makeMatch({ goalEvents: [goal(50, false)] });
    expect(teamConcededInFirstHalf(m, 100)).toBe(false);
  });
  it('retourne false pour goal_events null', () => {
    const m = { home_team_id: 100, away_team_id: 200, goal_events: null };
    expect(teamConcededInFirstHalf(m, 100)).toBe(false);
  });
});

// --- computeStreak ---
describe('computeStreak', () => {
  it('retourne 0 pour une liste vide', () => {
    expect(computeStreak([], () => true)).toBe(0);
  });
  it('retourne 0 si le premier match échoue', () => {
    const matches = [makeMatch({ goalEvents: [] }), makeMatch({ goalEvents: [goal(35)] })];
    expect(computeStreak(matches, m => teamScored31to45(m, 100))).toBe(0);
  });
  it('compte correctement un streak de 3', () => {
    const matches = homeMatches31to45(3);
    expect(computeStreak(matches, m => teamScored31to45(m, 100))).toBe(3);
  });
  it('s\'arrête au premier match raté', () => {
    const matches = [
      makeMatch({ goalEvents: [goal(35, true)] }),
      makeMatch({ goalEvents: [goal(35, true)] }),
      makeMatch({ goalEvents: [] }),                  // cassé ici
      makeMatch({ goalEvents: [goal(35, true)] }),
    ];
    expect(computeStreak(matches, m => teamScored31to45(m, 100))).toBe(2);
  });
  it('retourne le nombre total si tous les matchs passent', () => {
    const matches = homeMatches31to45(5);
    expect(computeStreak(matches, m => teamScored31to45(m, 100))).toBe(5);
  });
});

// --- confirmationRate ---
describe('confirmationRate', () => {
  it('retourne rate 0 pour un tableau vide', () => {
    const r = confirmationRate([], 5, () => true);
    expect(r.rate).toBe(0);
    expect(r.total).toBe(0);
  });
  it('calcule correctement 3/5', () => {
    const matches = [
      makeMatch({ goalEvents: [goal(20, false)] }), // concède
      makeMatch({ goalEvents: [goal(20, false)] }),
      makeMatch({ goalEvents: [] }),
      makeMatch({ goalEvents: [goal(20, false)] }),
      makeMatch({ goalEvents: [] }),
    ];
    const r = confirmationRate(matches, 5, m => teamConcededInFirstHalf(m, 100));
    expect(r.rate).toBeCloseTo(0.6);
    expect(r.count).toBe(3);
    expect(r.total).toBe(5);
  });
  it('retourne 1 si tous passent', () => {
    const matches = Array(5).fill(null).map(() => makeMatch({ goalEvents: [goal(20, false)] }));
    const r = confirmationRate(matches, 5, m => teamConcededInFirstHalf(m, 100));
    expect(r.rate).toBe(1);
  });
  it('utilise au plus windowSize matchs', () => {
    // 7 matchs mais window = 3 → slice à 3
    const matches = [
      makeMatch({ goalEvents: [goal(20, false)] }),
      makeMatch({ goalEvents: [goal(20, false)] }),
      makeMatch({ goalEvents: [goal(20, false)] }),
      makeMatch({ goalEvents: [] }), // hors fenêtre
      makeMatch({ goalEvents: [] }),
      makeMatch({ goalEvents: [] }),
      makeMatch({ goalEvents: [] }),
    ];
    const r = confirmationRate(matches, 3, m => teamConcededInFirstHalf(m, 100));
    expect(r.total).toBe(3);
    expect(r.rate).toBe(1);
  });
});

// --- isH2HCleanSheetFirstHalf ---
describe('isH2HCleanSheetFirstHalf', () => {
  it('retourne false si moins de 3 H2H', () => {
    const h2h = [makeMatch(), makeMatch()];
    expect(isH2HCleanSheetFirstHalf(h2h, 100)).toBe(false);
  });
  it('retourne true si 3 H2H et équipe n\'a jamais marqué en 1MT', () => {
    const h2h = Array(3).fill(null).map(() =>
      makeMatch({ goalEvents: [goal(20, false)] }) // seul l'adversaire marque en 1MT
    );
    expect(isH2HCleanSheetFirstHalf(h2h, 100)).toBe(true);
  });
  it('retourne false si équipe a marqué en 1MT dans au moins 1 H2H', () => {
    const h2h = [
      makeMatch({ goalEvents: [goal(20, true)] }), // 100 marque en 1MT
      makeMatch({ goalEvents: [] }),
      makeMatch({ goalEvents: [] }),
    ];
    expect(isH2HCleanSheetFirstHalf(h2h, 100)).toBe(false);
  });
  it('retourne false si exactement 3 H2H mais l\'équipe a marqué au-delà de 45', () => {
    // but à min 46 (pas en 1MT) → équipe n'a jamais marqué en 1MT → veto
    const h2h = Array(3).fill(null).map(() =>
      makeMatch({ goalEvents: [goal(50, true)] })
    );
    expect(isH2HCleanSheetFirstHalf(h2h, 100)).toBe(true);
  });
});

// --- analyzeScenarioA ---
describe('analyzeScenarioA', () => {
  it('retourne null si < STREAK_MIN_MATCHES matchs équipe', () => {
    const teamMatches = homeMatches31to45(2);
    const opp = oppConcedesHalf(5);
    expect(analyzeScenarioA(teamMatches, 100, opp, 200)).toBeNull();
  });
  it('retourne confidence null si streak < STREAK_MOYEN (=2)', () => {
    const teamMatches = [
      makeMatch({ goalEvents: [] }),          // pas de but 31-45 au match le plus récent → streak 0
      ...homeMatches31to45(3),
    ];
    const opp = oppConcedesHalf(5);
    const r = analyzeScenarioA(teamMatches, 100, opp, 200);
    expect(r.confidence).toBeNull();
    expect(r.streakScored).toBe(0);
  });
  it('retourne confidence moyen si streak 2 + confirmation OK', () => {
    const teamMatches = [
      ...homeMatches31to45(2),
      makeMatch({ goalEvents: [] }),
    ];
    // opp : équipe 200 (home_team_id=200) encaisse en 1MT ≥60% → mais ici on vérifie teamConcededInFirstHalf(m, 200)
    // dans analyzeScenarioA, oppConcedes = confirmationRate(opponentMatches, CONFIRM_WINDOW, m => teamConcededInFirstHalf(m, opponentId))
    // opponentId=200. makeMatch par défaut a home_team_id=100. teamConcededInFirstHalf(m,200) = events.some(e => e.min<=45 && e.home !== (200===100)) = e.home === true
    const opp = Array(5).fill(null).map(() => makeMatch({ goalEvents: [goal(20, true)] })); // home=true, 200 n'est pas home donc 200 encaisse
    const r = analyzeScenarioA(teamMatches, 100, opp, 200);
    expect(r.confidence).toBe('moyen');
    expect(r.streakScored).toBe(2);
  });
  it('retourne confidence fort si streak 3 + confirmation OK', () => {
    const teamMatches = homeMatches31to45(4);
    const opp = Array(5).fill(null).map(() => makeMatch({ goalEvents: [goal(20, true)] }));
    const r = analyzeScenarioA(teamMatches, 100, opp, 200);
    expect(r.confidence).toBe('fort');
    expect(r.streakScored).toBe(4);
  });
  it('retourne confidence null si taux confirmation < 60%', () => {
    const teamMatches = homeMatches31to45(4);
    // seulement 2/5 matchs avec but adverse en 1MT
    const opp = [
      makeMatch({ goalEvents: [goal(20, true)] }),
      makeMatch({ goalEvents: [goal(20, true)] }),
      makeMatch({ goalEvents: [] }),
      makeMatch({ goalEvents: [] }),
      makeMatch({ goalEvents: [] }),
    ];
    const r = analyzeScenarioA(teamMatches, 100, opp, 200);
    expect(r.confidence).toBeNull();
  });
  it('retourne confidence null si sample confirmation < CONFIRM_MIN_SAMPLE (=3)', () => {
    const teamMatches = homeMatches31to45(4);
    // seulement 2 matchs adversaire → total < 3
    const opp = Array(2).fill(null).map(() => makeMatch({ goalEvents: [goal(20, true)] }));
    const r = analyzeScenarioA(teamMatches, 100, opp, 200);
    expect(r.confidence).toBeNull();
  });
});

// --- analyzeScenarioB ---
describe('analyzeScenarioB', () => {
  it('retourne null si < STREAK_MIN_MATCHES matchs adversaire', () => {
    const opp = homeMatches31to45(2);
    const team = homeMatches31to45(5);
    // analyzeScenarioB(opponentMatches, opponentId, teamMatches, teamId)
    expect(analyzeScenarioB(opp, 200, team, 100)).toBeNull();
  });
  it('retourne confidence moyen si streak adversaire encaisse 31-45 consécutif (2) + confirmation OK', () => {
    // Adversaire (200) encaisse en 31-45 dans les 2 premiers matchs
    // makeMatch default: home_team_id=100, away_team_id=200
    // teamConceded31to45(m, 200): e.home !== (200===100) === e.home !== false === e.home === true
    const opp = [
      makeMatch({ goalEvents: [goal(35, true)] }),  // 200 encaisse 31-45
      makeMatch({ goalEvents: [goal(35, true)] }),  // 200 encaisse 31-45
      makeMatch({ goalEvents: [] }),
    ];
    // Équipe (100) marque en 1MT ≥60% sur 5 derniers
    // teamScoredInFirstHalf(m, 100): e.min<=45 && e.home === (100===100) === e.home === true
    const team = Array(5).fill(null).map(() => makeMatch({ goalEvents: [goal(20, true)] }));
    const r = analyzeScenarioB(opp, 200, team, 100);
    expect(r.confidence).toBe('moyen');
    expect(r.streakConceded).toBe(2);
  });
  it('retourne confidence fort si streak adversaire 3+', () => {
    const opp = Array(4).fill(null).map(() => makeMatch({ goalEvents: [goal(35, true)] }));
    const team = Array(5).fill(null).map(() => makeMatch({ goalEvents: [goal(20, true)] }));
    const r = analyzeScenarioB(opp, 200, team, 100);
    expect(r.confidence).toBe('fort');
  });
});

// --- analyzeStreakAlert ---
describe('analyzeStreakAlert', () => {
  // Helper : construit un appel valide avec A actif et B inactif
  function buildAlertA() {
    const teamMatches = homeMatches31to45(4);
    const oppMatches = Array(5).fill(null).map(() => makeMatch({ goalEvents: [goal(20, true)] }));
    const h2h = [];
    return { teamMatches, oppMatches, h2h };
  }

  it('veto H2H prioritaire — retourne isAlert false si cleanSheetBlock', () => {
    const h2h = Array(3).fill(null).map(() => makeMatch({ goalEvents: [goal(35, false)] }));
    const r = analyzeStreakAlert(homeMatches31to45(4), 100, [], 200, h2h);
    expect(r.isAlert).toBe(false);
    expect(r.cleanSheetBlock).toBe(true);
  });

  it('A seul → FHG_A avec la bonne confidence', () => {
    const { teamMatches, oppMatches, h2h } = buildAlertA();
    const r = analyzeStreakAlert(teamMatches, 100, oppMatches, 200, h2h);
    expect(r.isAlert).toBe(true);
    expect(r.signalType).toBe('FHG_A');
    expect(['moyen', 'fort']).toContain(r.confidence);
  });

  it('B seul → FHG_B', () => {
    // Aucun streak A (équipe ne marque pas en 31-45)
    const teamMatches = Array(4).fill(null).map(() => makeMatch({ goalEvents: [] }));
    // Adversaire (id=200) encaisse 31-45 en streak : makeMatch default home=100, 200 encaisse si goal home:true
    const oppMatches = Array(4).fill(null).map(() => makeMatch({ goalEvents: [goal(35, true)] }));
    // teamScoredInFirstHalf pour équipe 100 → goal home:true avant 45
    const teamMatchesConf = Array(5).fill(null).map(() => makeMatch({ goalEvents: [goal(20, true)] }));
    // analyzeStreakAlert(teamMatches, teamId, opponentMatches, opponentId, h2h)
    // Ici teamMatches = matchs de 100 (pas de streak A car pas de but 31-45)
    // opponentMatches = matchs de 200 (streak B car 200 encaisse 31-45)
    // confirmation B = team (100) marque en 1MT → teamMatchesConf
    // Mais analyzeScenarioB utilise teamMatches pour la confirmation...
    // → on passe teamMatchesConf comme teamMatches pour que la confirmation B passe
    const r = analyzeStreakAlert(teamMatchesConf, 100, oppMatches, 200, []);
    // A : streakScored de 100 dans teamMatchesConf → teamMatchesConf ont goal(20,true) → teamScored31to45 = false (min 20 < 31) → streak 0
    // B : streakConceded de 200 dans oppMatches → goal(35, true), home_team_id=100, 200 n'est pas home → e.home !== false → true → encaisse → streak 4
    //     confirmation B : teamScoredInFirstHalf de 100 dans teamMatchesConf → goal(20,true), min<=45, home===true → true → 5/5 ≥ 60% ✓
    expect(r.isAlert).toBe(true);
    expect(r.signalType).toBe('FHG_B');
  });

  it('A+B actifs → FHG_A+B avec fort_double', () => {
    // A : teamMatches avec streak 31-45 de 100
    const teamMatches = homeMatches31to45(4); // goal(35,true) → streak 31-45 home ✓
    // B : oppMatches où 200 encaisse 31-45 → goal(35,true) dans match home=100 → 200 encaisse
    const oppMatches = Array(4).fill(null).map(() => makeMatch({ goalEvents: [goal(35, true)] }));
    // Confirmation A : teamConcededInFirstHalf de 200 dans oppMatches → goal(35,true), 200 n'est pas home_team_id(100) → e.home !== false → true → 4/4 ≥ 60% ✓
    // Confirmation B : teamScoredInFirstHalf de 100 dans teamMatches → goal(35,true), min<=45, e.home===true → true → 4/4 ≥ 60% ✓
    const r = analyzeStreakAlert(teamMatches, 100, oppMatches, 200, []);
    expect(r.isAlert).toBe(true);
    expect(r.signalType).toBe('FHG_A+B');
    expect(r.confidence).toBe('fort_double');
    expect(r.factors).toHaveProperty('scenarioA');
    expect(r.factors).toHaveProperty('scenarioB');
  });

  it('rien d\'actif → isAlert false', () => {
    const teamMatches = Array(4).fill(null).map(() => makeMatch({ goalEvents: [] }));
    const oppMatches = Array(4).fill(null).map(() => makeMatch({ goalEvents: [] }));
    const r = analyzeStreakAlert(teamMatches, 100, oppMatches, 200, []);
    expect(r.isAlert).toBe(false);
    expect(r.cleanSheetBlock).toBeUndefined();
  });
});

// ========================
// analyzeFHGFromMatches
// ========================

describe('analyzeFHGFromMatches', () => {
  it('returns null when fewer than MIN_MATCHES', () => {
    const matches = [makeTeamMatch()];
    expect(analyzeFHGFromMatches(matches, 'home', [], 100, [])).toBeNull();
  });

  it('detects goals in 31-45 minute window for home context', () => {
    const matches = Array(6).fill(null).map(() =>
      makeTeamMatch({
        goalEvents: [
          { min: 35, home: true },  // home team scored at 35min
          { min: 60, home: true },  // outside window
        ],
      })
    );
    const result = analyzeFHGFromMatches(matches, 'home', [], 100, []);

    expect(result).not.toBeNull();
    expect(result.factors.recurrence1MT).toBe(100); // all 6 matches had a goal in window
  });

  it('ignores goals outside 31-45 window', () => {
    const matches = Array(6).fill(null).map(() =>
      makeTeamMatch({
        goalEvents: [
          { min: 10, home: true },  // too early
          { min: 50, home: true },  // too late
        ],
      })
    );
    const result = analyzeFHGFromMatches(matches, 'home', [], 100, []);

    expect(result.factors.recurrence1MT).toBe(0);
  });

  it('only counts goals from the correct team (home context)', () => {
    const matches = Array(5).fill(null).map(() =>
      makeTeamMatch({
        goalEvents: [
          { min: 35, home: false },  // opponent goal, not team goal
        ],
      })
    );
    const result = analyzeFHGFromMatches(matches, 'home', [], 100, []);

    expect(result.factors.recurrence1MT).toBe(0);
  });

  it('handles away context correctly', () => {
    const matches = Array(5).fill(null).map(() =>
      makeTeamMatch({
        goalEvents: [
          { min: 40, home: false },  // away team scored (context=away, home=false => team goal)
        ],
      })
    );
    const result = analyzeFHGFromMatches(matches, 'away', [], 200, []);

    expect(result.factors.recurrence1MT).toBe(100);
  });

  it('activates clean sheet block when team never scored in H2H', () => {
    const matches = Array(5).fill(null).map(() =>
      makeTeamMatch({ goalEvents: [{ min: 35, home: true }] })
    );
    // H2H: 3 matches, team 100 never scored (0 goals when home, 0 goals when away)
    const h2h = Array(3).fill(null).map(() =>
      makeH2HMatch({ homeId: 100, awayId: 200, homeGoals: 0, awayGoals: 1, goalEvents: [{ min: 10, home: false }] })
    );
    const result = analyzeFHGFromMatches(matches, 'home', h2h, 100, []);

    expect(result.cleanSheetBlock).toBe(true);
    expect(result.isAlert).toBe(false);
  });

  it('does not block when team has goals in H2H 31-45 window', () => {
    const matches = Array(5).fill(null).map(() =>
      makeTeamMatch({ goalEvents: [{ min: 35, home: true }] })
    );
    const h2h = [
      makeH2HMatch({ homeId: 100, awayId: 200, goalEvents: [{ min: 35, home: true }] }),
      makeH2HMatch({ homeId: 200, awayId: 100, goalEvents: [] }),
      makeH2HMatch({ homeId: 100, awayId: 200, goalEvents: [] }),
    ];
    const oppMatches = Array(5).fill(null).map(() =>
      makeTeamMatch({ homeGoals: 1, awayGoals: 1 })
    );
    const result = analyzeFHGFromMatches(matches, 'home', h2h, 100, oppMatches);

    expect(result.cleanSheetBlock).toBe(false);
  });

  it('checks opponent concedes enough (>= 2 out of >= 3)', () => {
    const matches = Array(5).fill(null).map(() =>
      makeTeamMatch({ goalEvents: [{ min: 35, home: true }] })
    );
    // Opponent matches where they concede (context=home, so opponent plays away,
    // oppContext = 'away', conceded = home_goals)
    const oppMatchesConcede = [
      makeTeamMatch({ homeGoals: 2, awayGoals: 0 }), // concedes (home_goals > 0)
      makeTeamMatch({ homeGoals: 1, awayGoals: 0 }), // concedes
      makeTeamMatch({ homeGoals: 0, awayGoals: 3 }), // does not concede
    ];
    const result = analyzeFHGFromMatches(matches, 'home', [], 100, oppMatchesConcede);

    expect(result.opponentConcedesEnough).toBe(true);
  });

  it('blocks alert when opponent does not concede enough', () => {
    const matches = Array(5).fill(null).map(() =>
      makeTeamMatch({ goalEvents: [{ min: 35, home: true }] })
    );
    const oppMatchesDefensive = [
      makeTeamMatch({ homeGoals: 0, awayGoals: 2 }),
      makeTeamMatch({ homeGoals: 0, awayGoals: 1 }),
      makeTeamMatch({ homeGoals: 1, awayGoals: 0 }), // only 1 concedes
    ];
    const result = analyzeFHGFromMatches(matches, 'home', [], 100, oppMatchesDefensive);

    expect(result.opponentConcedesEnough).toBe(false);
    expect(result.isAlert).toBe(false);
  });

  it('calculates composite score with reaction factor', () => {
    // Need at least 2 matches where opponent scored in 31-45 for pctReaction to kick in
    const matches = Array(5).fill(null).map((_, i) =>
      makeTeamMatch({
        goalEvents: [
          { min: 35, home: true },  // team scored
          { min: 38, home: false }, // opponent scored (enables reaction check)
        ],
      })
    );
    const oppMatches = Array(5).fill(null).map(() =>
      makeTeamMatch({ homeGoals: 2, awayGoals: 1 })
    );
    const result = analyzeFHGFromMatches(matches, 'home', [], 100, oppMatches);

    expect(result.factors.reaction1MT).not.toBeNull();
    expect(result.factors.reaction1MT).toBe(100); // reacted in all
  });

  it('returns correct confidence levels', () => {
    // Score >= 65 => fort
    const matchesFort = Array(10).fill(null).map(() =>
      makeTeamMatch({ goalEvents: [{ min: 35, home: true }] })
    );
    const oppMatchesFort = Array(5).fill(null).map(() =>
      makeTeamMatch({ homeGoals: 2, awayGoals: 1, homeGoalsHt: 1, awayGoalsHt: 0 })
    );
    const resultFort = analyzeFHGFromMatches(matchesFort, 'home', [], 100, oppMatchesFort);

    expect(resultFort.confidence).toBe('fort');
    expect(resultFort.isAlert).toBe(true);
  });
});
