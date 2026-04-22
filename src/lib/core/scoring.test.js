import { describe, it, expect } from 'vitest';
import { calculerScoreFHG, calculerScoreDC, analyserMatch, getTimerConseille } from './scoring.js';

// --- Mock team data ---

function makeEquipe(overrides = {}) {
  return {
    matches_played: 20,
    matches_scored_first_half: 16,          // 80% pct1MT
    matches_2plus_goals_first_half: 6,      // 30% pct2Plus1MT
    matches_behind_and_scored: undefined,
    matches_behind: undefined,
    pct_retour_si_encaisse: 30,
    pct_victoire_domicile: 60,
    ...overrides,
  };
}

function makeAdversaire(overrides = {}) {
  return {
    matches_played: 20,
    matches_played_context: 10,
    goals_conceded_first_half: 6,           // 60% pctAdversaire (6/10 mapped via matches_played)
    matches_conceded_first_half: 4,         // 4/10 => passes 2/5 filter
    ...overrides,
  };
}

function makeH2H(butAvant45 = true) {
  return { equipe_ciblee_but_avant_45min: butAvant45 };
}

describe('calculerScoreFHG — raw percentages', () => {
  it('calculates raw percentages correctly', () => {
    const equipe = makeEquipe();
    const result = calculerScoreFHG(equipe, []);

    expect(result.exclu).toBe(false);
    expect(result.pct1MT).toBe(80);
    expect(result.pct2Plus1MT).toBe(30);
    expect(result.pctAdversaire).toBe(0); // no adversaire passed
    expect(result.pctReaction).toBeNull();
  });

  it('computes composite score as weighted average', () => {
    const equipe = makeEquipe();
    const adv = makeAdversaire();
    const result = calculerScoreFHG(equipe, [], { adversaire: adv });

    // Without reaction: 80*0.55 + 30*0.28 + 30*0.17 = 44 + 8.4 + 5.1 = 57.5 => 58
    // pctAdversaire = round(6/20 * 100) = 30
    expect(result.compositeScore).toBe(58);
    expect(result.pct1MT).toBe(80);
    expect(result.pctAdversaire).toBe(30);
  });

  it('includes reaction in composite when available', () => {
    const equipe = makeEquipe({
      matches_behind: 4,
      matches_behind_and_scored: 2,
    });
    const result = calculerScoreFHG(equipe, []);

    expect(result.pctReaction).toBe(50);
    // With reaction: 80*0.50 + 0*0.25 + 30*0.15 + 50*0.10 = 40 + 0 + 4.5 + 5 = 49.5 => 50
    expect(result.compositeScore).toBe(50);
  });

  it('confidence is fort when compositeScore >= 65', () => {
    const equipe = makeEquipe({
      matches_scored_first_half: 19,        // 95%
      matches_2plus_goals_first_half: 14,   // 70%
    });
    const adv = makeAdversaire({ goals_conceded_first_half: 16 }); // 80%
    const result = calculerScoreFHG(equipe, [], { adversaire: adv });

    expect(result.confidence).toBe('fort');
    expect(result.isAlert).toBe(true);
  });

  it('confidence is moyen when compositeScore >= 50 and < 65', () => {
    const equipe = makeEquipe({
      matches_scored_first_half: 12,        // 60%
      matches_2plus_goals_first_half: 4,    // 20%
    });
    const adv = makeAdversaire({ goals_conceded_first_half: 10 }); // 50%
    const result = calculerScoreFHG(equipe, [], { adversaire: adv });

    // 60*0.55 + 50*0.28 + 20*0.17 = 33 + 14 + 3.4 = 50.4 => 50
    expect(result.compositeScore).toBeGreaterThanOrEqual(50);
    expect(result.compositeScore).toBeLessThan(65);
    expect(result.confidence).toBe('moyen');
    expect(result.isAlert).toBe(true);
  });

  it('confidence is null when compositeScore < 50', () => {
    const equipe = makeEquipe({
      matches_scored_first_half: 4,         // 20%
      matches_2plus_goals_first_half: 1,    // 5%
    });
    const result = calculerScoreFHG(equipe, []);

    expect(result.compositeScore).toBeLessThan(50);
    expect(result.confidence).toBeNull();
    expect(result.isAlert).toBe(false);
  });
});

describe('calculerScoreFHG — exclusion filters', () => {
  it('excludes team when H2H clean sheet (0 goals before 45min in >= 3 H2H)', () => {
    const equipe = makeEquipe();
    const h2h = [makeH2H(false), makeH2H(false), makeH2H(false)];
    const result = calculerScoreFHG(equipe, h2h);

    expect(result.exclu).toBe(true);
    expect(result.compositeScore).toBe(0);
    expect(result.warningH2H).toBe('rouge');
    expect(result.raisonExclusion).toContain('Clean Sheet H2H');
    expect(result.isAlert).toBe(false);
  });

  it('applies orange warning when only 1 H2H goal before 45min', () => {
    const equipe = makeEquipe();
    const h2h = [makeH2H(true), makeH2H(false), makeH2H(false)];
    const result = calculerScoreFHG(equipe, h2h);

    expect(result.exclu).toBe(false);
    expect(result.warningH2H).toBe('orange');
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

  it('disables H2H filter when filtreH2HActif is false', () => {
    const equipe = makeEquipe();
    const h2h = [makeH2H(false), makeH2H(false), makeH2H(false)];
    const result = calculerScoreFHG(equipe, h2h, { filtreH2HActif: false });

    expect(result.exclu).toBe(false);
  });

  it('marks excluded when adversaire does not concede enough', () => {
    const equipe = makeEquipe();
    const adv = makeAdversaire({
      matches_played_context: 10,
      matches_conceded_first_half: 1,       // < 2 => excluded
    });
    const result = calculerScoreFHG(equipe, [], { adversaire: adv });

    expect(result.excluded).toBe(true);
    expect(result.isAlert).toBe(false);
    expect(result.exclusionReason).toContain('Adversaire');
  });
});

describe('calculerScoreFHG — edge cases', () => {
  it('handles empty equipe data gracefully', () => {
    const result = calculerScoreFHG({}, []);

    expect(result.exclu).toBe(false);
    expect(result.pct1MT).toBe(0);
    expect(result.pct2Plus1MT).toBe(0);
    expect(result.compositeScore).toBe(0);
    expect(result.confidence).toBeNull();
  });

  it('handles missing fields without crashing', () => {
    const result = calculerScoreFHG({ matches_played: 10 }, []);

    expect(result.exclu).toBe(false);
    expect(result.pct1MT).toBe(0);
    expect(result.compositeScore).toBe(0);
  });

  it('clamps score to minimum 0', () => {
    const equipe = makeEquipe({
      matches_played: 1,
      matches_scored_first_half: 0,
      matches_2plus_goals_first_half: 0,
    });
    const result = calculerScoreFHG(equipe, []);
    expect(result.compositeScore).toBeGreaterThanOrEqual(0);
  });

  it('no reaction when matches_behind < 2', () => {
    const equipe = makeEquipe({
      matches_behind: 1,
      matches_behind_and_scored: 1,
    });
    const result = calculerScoreFHG(equipe, []);
    expect(result.pctReaction).toBeNull();
  });
});

describe('calculerScoreDC', () => {
  it('returns null when FHG score < 50', () => {
    expect(calculerScoreDC(makeEquipe(), 49)).toBeNull();
    expect(calculerScoreDC(makeEquipe(), 0)).toBeNull();
  });

  it('returns null when scoreFHG is null', () => {
    expect(calculerScoreDC(makeEquipe(), null)).toBeNull();
  });

  it('calculates DC score when FHG >= 50', () => {
    const equipe = makeEquipe();
    const result = calculerScoreDC(equipe, 80);
    expect(result).toBeGreaterThan(0);
    expect(typeof result).toBe('number');
  });

  it('gives bonus for teams with > 10 matches played', () => {
    const equipeMany = makeEquipe({ matches_played: 15 });
    const equipeFew = makeEquipe({ matches_played: 8 });
    const scoreMany = calculerScoreDC(equipeMany, 80);
    const scoreFew = calculerScoreDC(equipeFew, 80);
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

  it('picks the higher composite score team when both are valid', () => {
    const homeTeam = makeEquipe({ matches_scored_first_half: 18 }); // 90% => higher
    const awayTeam = makeEquipe({ matches_scored_first_half: 6 });  // 30% => lower
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
