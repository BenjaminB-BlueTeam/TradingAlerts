import { describe, it, expect } from 'vitest';
import { calculerScoreFHG, calculerScoreDC, analyserMatch, getTimerConseille } from './scoring.js';

// --- Mock team data ---

function makeEquipe(overrides = {}) {
  return {
    matches_played: 20,
    matches_played_n1: 20,
    goals_scored_min_31_to_45: 8,        // 40% taux N
    goals_scored_min_31_to_45_n1: 7,     // 35% taux N-1
    buts_31_45_sur_5_derniers: 2,         // 40% forme
    matches_scored_first_half: 12,        // 60% pct1MT
    pct_retour_si_encaisse: 30,
    pct_victoire_domicile: 60,
    ...overrides,
  };
}

function makeH2H(butAvant45 = true) {
  return { equipe_ciblee_but_avant_45min: butAvant45 };
}

describe('calculerScoreFHG', () => {
  it('calculates a basic score with default config', () => {
    const equipe = makeEquipe();
    const result = calculerScoreFHG(equipe, []);

    expect(result.exclu).toBe(false);
    expect(result.score).toBeGreaterThan(0);
    expect(result.tauxN).toBe(40);
    expect(result.tauxN1).toBe(35);
    expect(result.forme5M).toBe(40);
    expect(result.pct1MT).toBe(60);
    expect(result.badge1MT50).toBe(true);
  });

  it('excludes team when H2H clean sheet (0 goals before 45min in >= 3 H2H)', () => {
    const equipe = makeEquipe();
    const h2h = [makeH2H(false), makeH2H(false), makeH2H(false)];
    const result = calculerScoreFHG(equipe, h2h);

    expect(result.exclu).toBe(true);
    expect(result.score).toBe(0);
    expect(result.warningH2H).toBe('rouge');
    expect(result.raisonExclusion).toContain('Clean Sheet H2H');
  });

  it('applies orange warning when only 1 H2H goal before 45min', () => {
    const equipe = makeEquipe();
    const h2h = [makeH2H(true), makeH2H(false), makeH2H(false)];
    const result = calculerScoreFHG(equipe, h2h);

    expect(result.exclu).toBe(false);
    expect(result.warningH2H).toBe('orange');
    // Orange warning applies -8 penalty
  });

  it('gives green warning when multiple H2H goals', () => {
    const equipe = makeEquipe();
    const h2h = [makeH2H(true), makeH2H(true), makeH2H(false)];
    const result = calculerScoreFHG(equipe, h2h);

    expect(result.warningH2H).toBe('vert');
  });

  it('reports insufficient H2H when < 3 matches', () => {
    const equipe = makeEquipe();
    const h2h = [makeH2H(true)];
    const result = calculerScoreFHG(equipe, h2h);

    expect(result.warningH2H).toBe('insuffisant');
  });

  it('applies bonus +8 when pct1MT >= 65', () => {
    const equipe = makeEquipe({ matches_scored_first_half: 14, matches_played: 20 }); // 70%
    const resultHigh = calculerScoreFHG(equipe, []);

    const equipeBase = makeEquipe({ matches_scored_first_half: 8, matches_played: 20 }); // 40%
    const resultBase = calculerScoreFHG(equipeBase, []);

    // High 1MT should have higher score (bonus +8 vs no bonus)
    expect(resultHigh.score).toBeGreaterThan(resultBase.score);
  });

  it('applies bonus +4 when pct1MT >= 50 but < 65', () => {
    const equipe = makeEquipe({ matches_scored_first_half: 12, matches_played: 20 }); // 60%
    const result = calculerScoreFHG(equipe, []);
    expect(result.badge1MT50).toBe(true);
  });

  it('applies stability bonus when N and N-1 are close', () => {
    // tauxN = 40%, tauxN1 = 40% => ecart = 0 <= 8 => +3
    const equipe = makeEquipe({
      goals_scored_min_31_to_45: 8,
      goals_scored_min_31_to_45_n1: 8,
    });
    const result = calculerScoreFHG(equipe, []);
    expect(result.score).toBeGreaterThan(0);
  });

  it('applies instability malus when N and N-1 differ > 15%', () => {
    // tauxN = 50%, tauxN1 = 10% => ecart = 40 > 15 => -5
    const equipe = makeEquipe({
      goals_scored_min_31_to_45: 10,   // 50%
      goals_scored_min_31_to_45_n1: 2, // 10%
    });
    const resultUnstable = calculerScoreFHG(equipe, []);

    const equipeStable = makeEquipe({
      goals_scored_min_31_to_45: 10,   // 50%
      goals_scored_min_31_to_45_n1: 10, // 50%
    });
    const resultStable = calculerScoreFHG(equipeStable, []);

    expect(resultStable.score).toBeGreaterThan(resultUnstable.score);
  });

  it('applies debut de saison malus when < 8 matches', () => {
    const equipe = makeEquipe({ matches_played: 5 });
    const result = calculerScoreFHG(equipe, []);

    expect(result.debutSaison).toBe(true);
    // Score should be lower due to -10 penalty
  });

  it('clamps score to minimum 0', () => {
    const equipe = makeEquipe({
      matches_played: 3,
      goals_scored_min_31_to_45: 0,
      goals_scored_min_31_to_45_n1: 0,
      buts_31_45_sur_5_derniers: 0,
      matches_scored_first_half: 0,
    });
    const result = calculerScoreFHG(equipe, []);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it('sets signal correctly based on score thresholds', () => {
    // High scoring team
    const equipeForte = makeEquipe({
      goals_scored_min_31_to_45: 18,     // 90%
      goals_scored_min_31_to_45_n1: 18,  // 90%
      buts_31_45_sur_5_derniers: 5,      // 100%
      matches_scored_first_half: 16,     // 80%
    });
    const resultFort = calculerScoreFHG(equipeForte, []);
    expect(resultFort.signal).toBe('fort');

    // Low scoring team
    const equipeFaible = makeEquipe({
      goals_scored_min_31_to_45: 2,
      goals_scored_min_31_to_45_n1: 2,
      buts_31_45_sur_5_derniers: 0,
      matches_scored_first_half: 4,
    });
    const resultFaible = calculerScoreFHG(equipeFaible, []);
    expect(resultFaible.signal).toBe('faible');
  });

  it('flags tropBeau when tauxN > 88', () => {
    const equipe = makeEquipe({ goals_scored_min_31_to_45: 18 }); // 90%
    const result = calculerScoreFHG(equipe, []);
    expect(result.tropBeau).toBe(true);
  });

  it('does not flag tropBeau when tauxN <= 88', () => {
    const equipe = makeEquipe({ goals_scored_min_31_to_45: 8 }); // 40%
    const result = calculerScoreFHG(equipe, []);
    expect(result.tropBeau).toBe(false);
  });

  it('disables H2H filter when filtreH2HActif is false', () => {
    const equipe = makeEquipe();
    const h2h = [makeH2H(false), makeH2H(false), makeH2H(false)];
    const result = calculerScoreFHG(equipe, h2h, { filtreH2HActif: false });

    expect(result.exclu).toBe(false);
  });
});

describe('calculerScoreDC', () => {
  it('returns null when FHG score < 60', () => {
    expect(calculerScoreDC(makeEquipe(), 59)).toBeNull();
    expect(calculerScoreDC(makeEquipe(), 0)).toBeNull();
  });

  it('returns null when scoreFHG is null', () => {
    expect(calculerScoreDC(makeEquipe(), null)).toBeNull();
  });

  it('calculates DC score when FHG >= 60', () => {
    const equipe = makeEquipe();
    const result = calculerScoreDC(equipe, 75);
    expect(result).toBeGreaterThan(0);
    expect(typeof result).toBe('number');
  });

  it('gives bonus for teams with > 10 matches played', () => {
    const equipeMany = makeEquipe({ matches_played: 15 });
    const equipeFew = makeEquipe({ matches_played: 8 });
    const scoreMany = calculerScoreDC(equipeMany, 75);
    const scoreFew = calculerScoreDC(equipeFew, 75);
    expect(scoreMany).toBeGreaterThan(scoreFew);
  });
});

describe('analyserMatch', () => {
  const match = { homeName: 'PSG', awayName: 'Lyon' };
  const config = { analyseDC: false };

  it('returns null when both teams are missing', () => {
    expect(analyserMatch(match, null, null, [], [], config)).toBeNull();
  });

  it('picks home team when only home is valid', () => {
    const homeTeam = makeEquipe();
    const result = analyserMatch(match, homeTeam, null, [], [], config);
    expect(result.exclu).toBe(false);
    expect(result.equipeSignal).toBe('PSG');
  });

  it('picks away team when only away is valid', () => {
    const awayTeam = makeEquipe();
    const result = analyserMatch(match, null, awayTeam, [], [], config);
    expect(result.exclu).toBe(false);
    expect(result.equipeSignal).toBe('Lyon');
  });

  it('picks the higher scoring team when both are valid', () => {
    const homeTeam = makeEquipe({ goals_scored_min_31_to_45: 16 }); // 80% => higher
    const awayTeam = makeEquipe({ goals_scored_min_31_to_45: 4 });  // 20% => lower
    const result = analyserMatch(match, homeTeam, awayTeam, [], [], config);
    expect(result.equipeSignal).toBe('PSG');
  });

  it('marks as excluded when both teams are excluded by H2H', () => {
    const homeTeam = makeEquipe();
    const awayTeam = makeEquipe();
    const h2h = [makeH2H(false), makeH2H(false), makeH2H(false)];
    const result = analyserMatch(match, homeTeam, awayTeam, h2h, h2h, config);
    expect(result.exclu).toBe(true);
    expect(result.raisonExclusion).toContain('Clean Sheet H2H');
  });
});

describe('getTimerConseille', () => {
  it('returns debutant timer', () => {
    const t = getTimerConseille('debutant');
    expect(t.min).toBe(5);
    expect(t.max).toBe(10);
  });

  it('returns expert timer', () => {
    const t = getTimerConseille('expert');
    expect(t.min).toBe(25);
    expect(t.max).toBe(35);
  });

  it('returns intermediaire timer by default', () => {
    const t = getTimerConseille('intermediaire');
    expect(t.min).toBe(15);
    expect(t.max).toBe(20);
  });

  it('returns intermediaire timer for unknown profile', () => {
    const t = getTimerConseille('whatever');
    expect(t.min).toBe(15);
    expect(t.max).toBe(20);
  });
});
