import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { analyzeDCFromH2H, analyzeFHGFromMatches, MIN_MATCHES } = require('./analysis.cjs');

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

  it('activates clean sheet block when no goals in H2H 31-45 window', () => {
    const matches = Array(5).fill(null).map(() =>
      makeTeamMatch({ goalEvents: [{ min: 35, home: true }] })
    );
    // H2H: 3 matches, no goals in 31-45 for this team
    const h2h = Array(3).fill(null).map(() =>
      makeH2HMatch({ homeId: 100, awayId: 200, goalEvents: [{ min: 10, home: true }] })
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
    // Score >= 80 => fort
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
