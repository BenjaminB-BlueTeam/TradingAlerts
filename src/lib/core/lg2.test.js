import { describe, it, expect } from 'vitest';
import {
  LG2_MIN_MINUTE,
  LG2_STREAK_MIN_MATCHES,
  LG2_STREAK_MOYEN,
  LG2_STREAK_FORT,
  matchHasGoalAfter80,
  computeLG2Streak,
  classifyConfidence,
  analyzeLG2,
} from './lg2.js';

function m(events) {
  return { goal_events: events };
}

describe('LG2 ESM — constantes', () => {
  it('80 minimum, 3 moyen, 4 fort', () => {
    expect(LG2_MIN_MINUTE).toBe(80);
    expect(LG2_STREAK_MIN_MATCHES).toBe(3);
    expect(LG2_STREAK_MOYEN).toBe(3);
    expect(LG2_STREAK_FORT).toBe(4);
  });
});

describe('matchHasGoalAfter80 (ESM)', () => {
  it('false si aucun but', () => {
    expect(matchHasGoalAfter80(m([]))).toBe(false);
  });

  it('false si buts avant 80', () => {
    expect(matchHasGoalAfter80(m([{ min: 79, home: true }, { min: 45, home: false }]))).toBe(false);
  });

  it('true si but à 80', () => {
    expect(matchHasGoalAfter80(m([{ min: 80, home: true }]))).toBe(true);
  });

  it('true si but à 90', () => {
    expect(matchHasGoalAfter80(m([{ min: 90, home: true }]))).toBe(true);
  });

  it('true si but en temps additionnel', () => {
    expect(matchHasGoalAfter80(m([{ min: 93, home: true }]))).toBe(true);
  });

  it('false si goal_events non-tableau', () => {
    expect(matchHasGoalAfter80({})).toBe(false);
    expect(matchHasGoalAfter80(null)).toBe(false);
  });
});

describe('computeLG2Streak (ESM)', () => {
  it('0 pour liste vide', () => {
    expect(computeLG2Streak([])).toBe(0);
    expect(computeLG2Streak(null)).toBe(0);
  });

  it('compte 3 consécutifs', () => {
    const matches = [m([{ min: 85 }]), m([{ min: 90 }]), m([{ min: 82 }])];
    expect(computeLG2Streak(matches)).toBe(3);
  });

  it('streak brisé', () => {
    const matches = [m([{ min: 85 }]), m([{ min: 40 }]), m([{ min: 89 }])];
    expect(computeLG2Streak(matches)).toBe(1);
  });
});

describe('classifyConfidence (ESM)', () => {
  it('paliers corrects', () => {
    expect(classifyConfidence(2)).toBeNull();
    expect(classifyConfidence(3)).toBe('moyen');
    expect(classifyConfidence(4)).toBe('fort');
    expect(classifyConfidence(10)).toBe('fort');
  });
});

describe('analyzeLG2 (ESM)', () => {
  it('insufficient_history si les deux côtés < 3', () => {
    const r = analyzeLG2([m([{ min: 85 }])], [m([{ min: 85 }])]);
    expect(r.isAlert).toBe(false);
    expect(r.reason).toBe('insufficient_history');
  });

  it('LG2_A moyen', () => {
    const home = [m([{ min: 85 }]), m([{ min: 88 }]), m([{ min: 82 }])];
    const away = [m([{ min: 30 }]), m([{ min: 20 }]), m([{ min: 15 }])];
    const r = analyzeLG2(home, away);
    expect(r.signalType).toBe('LG2_A');
    expect(r.confidence).toBe('moyen');
  });

  it('LG2_A fort', () => {
    const home = Array(4).fill(null).map(() => m([{ min: 85 }]));
    const away = [m([{ min: 30 }]), m([{ min: 20 }]), m([{ min: 15 }])];
    expect(analyzeLG2(home, away).confidence).toBe('fort');
  });

  it('LG2_B moyen', () => {
    const home = [m([{ min: 30 }]), m([{ min: 20 }]), m([{ min: 15 }])];
    const away = [m([{ min: 85 }]), m([{ min: 88 }]), m([{ min: 82 }])];
    const r = analyzeLG2(home, away);
    expect(r.signalType).toBe('LG2_B');
    expect(r.confidence).toBe('moyen');
  });

  it('LG2_A+B fort_double', () => {
    const home = [m([{ min: 85 }]), m([{ min: 88 }]), m([{ min: 82 }])];
    const away = [m([{ min: 85 }]), m([{ min: 88 }]), m([{ min: 82 }])];
    const r = analyzeLG2(home, away);
    expect(r.signalType).toBe('LG2_A+B');
    expect(r.confidence).toBe('fort_double');
  });

  it('pas d\'alerte si streak < 3 des deux côtés', () => {
    const home = [m([{ min: 85 }]), m([{ min: 30 }]), m([{ min: 20 }])];
    const away = [m([{ min: 85 }]), m([{ min: 30 }]), m([{ min: 20 }])];
    expect(analyzeLG2(home, away).isAlert).toBe(false);
  });
});
