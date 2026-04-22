import { describe, it, expect } from 'vitest';
import { computeTeamStats, goalBar } from './teamData.js';

// --- Mock match data ---

function makeMatch(overrides = {}) {
  return {
    home_goals: 2,
    away_goals: 1,
    home_goals_ht: 1,
    away_goals_ht: 0,
    goal_events: [],
    ...overrides,
  };
}

describe('computeTeamStats', () => {
  it('returns null for empty array', () => {
    expect(computeTeamStats([], 'home')).toBeNull();
  });

  it('computes correct stats for home context', () => {
    const matches = [
      makeMatch({ home_goals: 3, away_goals: 1, home_goals_ht: 2, away_goals_ht: 0 }),
      makeMatch({ home_goals: 1, away_goals: 1, home_goals_ht: 0, away_goals_ht: 1 }),
      makeMatch({ home_goals: 2, away_goals: 0, home_goals_ht: 1, away_goals_ht: 0 }),
    ];
    const stats = computeTeamStats(matches, 'home');

    expect(stats).not.toBeNull();
    expect(stats.total).toBe(3);
    // avgGoals = (3+1 + 1+1 + 2+0) / 3 = 8/3 = 2.67
    expect(stats.avgGoals).toBeCloseTo(2.67, 1);
    // pctGoal1MT: matches where home scored HT > 0: match1 (2), match3 (1) = 2/3 = 67%
    expect(stats.pctGoal1MT).toBe(67);
    // pct2Plus1MT: matches where home scored HT >= 2: match1 (2) = 1/3 = 33%
    expect(stats.pct2Plus1MT).toBe(33);
  });

  it('computes correct stats for away context', () => {
    const matches = [
      makeMatch({ home_goals: 0, away_goals: 2, home_goals_ht: 0, away_goals_ht: 1 }),
      makeMatch({ home_goals: 1, away_goals: 0, home_goals_ht: 1, away_goals_ht: 0 }),
    ];
    const stats = computeTeamStats(matches, 'away');

    expect(stats).not.toBeNull();
    expect(stats.total).toBe(2);
    // scored = [2, 0], conceded = [0, 1]
    // avgGoals = (2+0 + 0+1) / 2 = 1.5
    expect(stats.avgGoals).toBeCloseTo(1.5, 1);
    // pctGoal1MT: away_goals_ht > 0: match1 (1) = 1/2 = 50%
    expect(stats.pctGoal1MT).toBe(50);
  });

  it('handles matches with zero goals', () => {
    const matches = [
      makeMatch({ home_goals: 0, away_goals: 0, home_goals_ht: 0, away_goals_ht: 0 }),
      makeMatch({ home_goals: 0, away_goals: 0, home_goals_ht: 0, away_goals_ht: 0 }),
    ];
    const stats = computeTeamStats(matches, 'home');

    expect(stats.avgGoals).toBe(0);
    expect(stats.pctGoal1MT).toBe(0);
    expect(stats.pct2Plus1MT).toBe(0);
    expect(stats.pctBTTS).toBe(0);
    expect(stats.pctOver25).toBe(0);
  });

  it('computes BTTS correctly', () => {
    const matches = [
      makeMatch({ home_goals: 2, away_goals: 1, home_goals_ht: 1, away_goals_ht: 0 }), // BTTS yes
      makeMatch({ home_goals: 1, away_goals: 0, home_goals_ht: 1, away_goals_ht: 0 }), // BTTS no
    ];
    const stats = computeTeamStats(matches, 'home');
    // BTTS: match where scored > 0 AND conceded > 0: match1 = 1/2 = 50%
    expect(stats.pctBTTS).toBe(50);
  });

  it('computes Over 2.5 correctly', () => {
    const matches = [
      makeMatch({ home_goals: 2, away_goals: 1 }), // total 3 > 2 => yes
      makeMatch({ home_goals: 1, away_goals: 0 }), // total 1 => no
      makeMatch({ home_goals: 1, away_goals: 1 }), // total 2 => no
    ];
    const stats = computeTeamStats(matches, 'home');
    // Over 2.5: 1/3 = 33%
    expect(stats.pctOver25).toBe(33);
  });

  it('handles missing goal fields gracefully (defaults to 0)', () => {
    const matches = [
      { home_goals: undefined, away_goals: null, home_goals_ht: undefined, away_goals_ht: null },
    ];
    const stats = computeTeamStats(matches, 'home');
    expect(stats.avgGoals).toBe(0);
    expect(stats.pctGoal1MT).toBe(0);
  });
});

describe('goalBar', () => {
  it('returns correct result W/D/L', () => {
    expect(goalBar(makeMatch({ home_goals: 2, away_goals: 1 }), 'home').result).toBe('W');
    expect(goalBar(makeMatch({ home_goals: 1, away_goals: 2 }), 'home').result).toBe('L');
    expect(goalBar(makeMatch({ home_goals: 1, away_goals: 1 }), 'home').result).toBe('D');
    // Away perspective
    expect(goalBar(makeMatch({ home_goals: 1, away_goals: 2 }), 'away').result).toBe('W');
  });

  it('returns correct total goals', () => {
    const bar = goalBar(makeMatch({ home_goals: 3, away_goals: 2 }), 'home');
    expect(bar.total).toBe(5);
  });

  it('uses goal_events when available with minutes', () => {
    const match = makeMatch({
      home_goals: 2,
      away_goals: 1,
      goal_events: [
        { min: 10, home: true },
        { min: 35, home: false },
        { min: 70, home: true },
      ],
    });
    const bar = goalBar(match, 'home');
    expect(bar.goals).toHaveLength(3);
    // First goal: min 10, scored by home team (context=home so scored=true)
    expect(bar.goals[0]).toMatchObject({ min: 10, pct: expect.any(Number), scored: true });
    // Second goal: min 35, scored by away (context=home so scored=false)
    expect(bar.goals[1]).toMatchObject({ min: 35, pct: expect.any(Number), scored: false });
    // Third goal: min 70, scored by home
    expect(bar.goals[2]).toMatchObject({ min: 70, pct: expect.any(Number), scored: true });
  });

  it('caps pct at 98', () => {
    const match = makeMatch({
      home_goals: 1,
      away_goals: 0,
      goal_events: [{ min: 120, home: true }],
    });
    const bar = goalBar(match, 'home');
    expect(bar.goals[0].pct).toBeLessThanOrEqual(98);
  });

  it('falls back to distributed goals when goal_events have no minutes', () => {
    const match = makeMatch({
      home_goals: 2,
      away_goals: 1,
      home_goals_ht: 1,
      away_goals_ht: 0,
      goal_events: [],
    });
    const bar = goalBar(match, 'home');
    // scoredHT=1, concededHT=0, scored2MT=1, conceded2MT=1 => 3 goals
    expect(bar.goals).toHaveLength(3);
    // All should have min and pct
    bar.goals.forEach(g => {
      expect(g.min).toBeGreaterThan(0);
      expect(g.pct).toBeGreaterThan(0);
      expect(typeof g.scored).toBe('boolean');
    });
  });

  it('handles match with 0 goals', () => {
    const match = makeMatch({
      home_goals: 0,
      away_goals: 0,
      home_goals_ht: 0,
      away_goals_ht: 0,
      goal_events: [],
    });
    const bar = goalBar(match, 'home');
    expect(bar.goals).toHaveLength(0);
    expect(bar.total).toBe(0);
    expect(bar.result).toBe('D');
  });

  it('handles away context in fallback mode', () => {
    const match = makeMatch({
      home_goals: 0,
      away_goals: 2,
      home_goals_ht: 0,
      away_goals_ht: 1,
      goal_events: [],
    });
    const bar = goalBar(match, 'away');
    // scoredHT=1(away_goals_ht), concededHT=0(home_goals_ht), scored2MT=1, conceded2MT=0
    expect(bar.goals).toHaveLength(2);
    expect(bar.goals.every(g => g.scored === true)).toBe(true);
    expect(bar.result).toBe('W');
  });
});
