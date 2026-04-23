import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  LG2_MIN_MINUTE,
  LG2_STREAK_MIN_MATCHES,
  LG2_STREAK_MOYEN,
  LG2_STREAK_FORT,
  matchHasGoalAfter80,
  computeLG2Streak,
  classifyConfidence,
  analyzeLG2,
} = require('./lg2.cjs');

function m(events) {
  return { goal_events: events };
}

describe('LG2 — constantes', () => {
  it('80 minimum, 3 moyen, 4 fort', () => {
    expect(LG2_MIN_MINUTE).toBe(80);
    expect(LG2_STREAK_MIN_MATCHES).toBe(3);
    expect(LG2_STREAK_MOYEN).toBe(3);
    expect(LG2_STREAK_FORT).toBe(4);
  });
});

describe('matchHasGoalAfter80', () => {
  it('false si aucun but', () => {
    expect(matchHasGoalAfter80(m([]))).toBe(false);
  });

  it('false si buts avant 80', () => {
    expect(matchHasGoalAfter80(m([{ min: 79, home: true }, { min: 45, home: false }]))).toBe(false);
  });

  it('true si but exactement à 80', () => {
    expect(matchHasGoalAfter80(m([{ min: 80, home: true }]))).toBe(true);
  });

  it('true si but après 80', () => {
    expect(matchHasGoalAfter80(m([{ min: 87, home: false }]))).toBe(true);
  });

  it('true si but à 90', () => {
    expect(matchHasGoalAfter80(m([{ min: 90, home: true }]))).toBe(true);
  });

  it('true si but en temps additionnel (min=91+)', () => {
    expect(matchHasGoalAfter80(m([{ min: 93, home: true }]))).toBe(true);
  });

  it('ignore les events.min non numérique', () => {
    expect(matchHasGoalAfter80(m([{ min: '85', home: true }]))).toBe(false);
  });

  it('false si goal_events non-tableau', () => {
    expect(matchHasGoalAfter80({ goal_events: null })).toBe(false);
    expect(matchHasGoalAfter80({})).toBe(false);
    expect(matchHasGoalAfter80(null)).toBe(false);
  });

  it('true si au moins un but >=80 dans une liste mixte', () => {
    expect(matchHasGoalAfter80(m([{ min: 12, home: true }, { min: 50, home: false }, { min: 82, home: true }]))).toBe(true);
  });
});

describe('computeLG2Streak', () => {
  it('0 pour liste vide', () => {
    expect(computeLG2Streak([])).toBe(0);
    expect(computeLG2Streak(null)).toBe(0);
    expect(computeLG2Streak(undefined)).toBe(0);
  });

  it('compte 3 si 3 consécutifs avec but après 80', () => {
    const matches = [
      m([{ min: 85 }]),
      m([{ min: 90 }]),
      m([{ min: 82 }]),
    ];
    expect(computeLG2Streak(matches)).toBe(3);
  });

  it('streak brisé dès le premier match sans but >=80', () => {
    const matches = [
      m([{ min: 85 }]),
      m([{ min: 40 }]), // break
      m([{ min: 89 }]),
    ];
    expect(computeLG2Streak(matches)).toBe(1);
  });

  it('0 si aucun but après 80 dans le match le plus récent', () => {
    const matches = [
      m([{ min: 30 }]),
      m([{ min: 85 }]),
      m([{ min: 87 }]),
    ];
    expect(computeLG2Streak(matches)).toBe(0);
  });

  it('streak long (6 consécutifs)', () => {
    const matches = Array(6).fill(null).map(() => m([{ min: 85 }]));
    expect(computeLG2Streak(matches)).toBe(6);
  });
});

describe('classifyConfidence', () => {
  it('null si streak < 3', () => {
    expect(classifyConfidence(0)).toBeNull();
    expect(classifyConfidence(2)).toBeNull();
  });

  it('moyen si streak === 3', () => {
    expect(classifyConfidence(3)).toBe('moyen');
  });

  it('fort si streak >= 4', () => {
    expect(classifyConfidence(4)).toBe('fort');
    expect(classifyConfidence(7)).toBe('fort');
  });
});

describe('analyzeLG2', () => {
  it('insufficient_history si home ET away < 3 matchs', () => {
    const r = analyzeLG2([m([{ min: 85 }]), m([{ min: 85 }])], [m([{ min: 85 }])]);
    expect(r.isAlert).toBe(false);
    expect(r.reason).toBe('insufficient_history');
  });

  it('LG2_A seul si home streak 3, away streak 0', () => {
    const home = [m([{ min: 85 }]), m([{ min: 88 }]), m([{ min: 82 }])];
    const away = [m([{ min: 30 }]), m([{ min: 20 }]), m([{ min: 15 }])];
    const r = analyzeLG2(home, away);
    expect(r.isAlert).toBe(true);
    expect(r.signalType).toBe('LG2_A');
    expect(r.confidence).toBe('moyen');
    expect(r.factors.streakHome).toBe(3);
    expect(r.factors.streakAway).toBe(0);
  });

  it('LG2_A fort si home streak 4+', () => {
    const home = Array(5).fill(null).map(() => m([{ min: 85 }]));
    const away = [m([{ min: 30 }]), m([{ min: 20 }]), m([{ min: 15 }])];
    const r = analyzeLG2(home, away);
    expect(r.signalType).toBe('LG2_A');
    expect(r.confidence).toBe('fort');
    expect(r.factors.streakHome).toBe(5);
  });

  it('LG2_B seul si away streak 3, home streak 0', () => {
    const home = [m([{ min: 30 }]), m([{ min: 20 }]), m([{ min: 15 }])];
    const away = [m([{ min: 85 }]), m([{ min: 88 }]), m([{ min: 82 }])];
    const r = analyzeLG2(home, away);
    expect(r.signalType).toBe('LG2_B');
    expect(r.confidence).toBe('moyen');
    expect(r.factors.streakHome).toBe(0);
    expect(r.factors.streakAway).toBe(3);
  });

  it('LG2_B fort si away streak 4+', () => {
    const home = [m([{ min: 30 }]), m([{ min: 20 }]), m([{ min: 15 }])];
    const away = Array(4).fill(null).map(() => m([{ min: 85 }]));
    const r = analyzeLG2(home, away);
    expect(r.signalType).toBe('LG2_B');
    expect(r.confidence).toBe('fort');
  });

  it('LG2_A+B si les deux côtés actifs', () => {
    const home = [m([{ min: 85 }]), m([{ min: 88 }]), m([{ min: 82 }])];
    const away = [m([{ min: 85 }]), m([{ min: 88 }]), m([{ min: 82 }])];
    const r = analyzeLG2(home, away);
    expect(r.signalType).toBe('LG2_A+B');
    expect(r.confidence).toBe('fort_double');
    expect(r.factors.streakHome).toBe(3);
    expect(r.factors.streakAway).toBe(3);
  });

  it('LG2_A+B fort_double quelles que soient les longueurs de streak', () => {
    const home = Array(5).fill(null).map(() => m([{ min: 85 }]));
    const away = [m([{ min: 85 }]), m([{ min: 88 }]), m([{ min: 82 }])];
    const r = analyzeLG2(home, away);
    expect(r.signalType).toBe('LG2_A+B');
    expect(r.confidence).toBe('fort_double');
  });

  it('pas d\'alerte si les deux côtés < 3', () => {
    const home = [m([{ min: 85 }]), m([{ min: 30 }]), m([{ min: 20 }])];
    const away = [m([{ min: 85 }]), m([{ min: 30 }]), m([{ min: 20 }])];
    const r = analyzeLG2(home, away);
    expect(r.isAlert).toBe(false);
    expect(r.factors.streakHome).toBe(1);
    expect(r.factors.streakAway).toBe(1);
  });

  it('LG2_B si home a trop peu de matchs mais away a le streak', () => {
    const home = [m([{ min: 85 }])]; // insufficient individually
    const away = [m([{ min: 85 }]), m([{ min: 88 }]), m([{ min: 82 }])];
    const r = analyzeLG2(home, away);
    expect(r.isAlert).toBe(true);
    expect(r.signalType).toBe('LG2_B');
  });
});
