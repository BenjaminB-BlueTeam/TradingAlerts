import { describe, it, expect } from 'vitest';
import {
  strategyOf, applyFilters,
  aggregateByStrategy, aggregateByTeam, aggregateByLeague,
  aggregateByDate, rateForBuckets,
} from './historyFilters.js';

function a(overrides = {}) {
  return {
    match_date: '2026-04-20',
    signal_type: 'LG1_A',
    confidence: 'fort',
    status: 'validated',
    home_team_id: 1, home_team_name: 'Alpha',
    away_team_id: 2, away_team_name: 'Beta',
    league_name: 'Ligue 1',
    ...overrides,
  };
}

describe('strategyOf', () => {
  it('LG1 pour chaque type LG1_*', () => {
    ['LG1_A', 'LG1_B', 'LG1_A+B', 'LG1_C', 'LG1_D'].forEach(t =>
      expect(strategyOf({ signal_type: t })).toBe('LG1')
    );
  });
  it('LG2 pour LG2_*', () => {
    ['LG2_A', 'LG2_B', 'LG2_A+B'].forEach(t =>
      expect(strategyOf({ signal_type: t })).toBe('LG2')
    );
  });
  it('null pour signal inconnu ou absent (inclut DC supprimé)', () => {
    expect(strategyOf({ signal_type: 'UNKNOWN' })).toBe(null);
    expect(strategyOf({ signal_type: 'DC' })).toBe(null);
    expect(strategyOf({})).toBe(null);
    expect(strategyOf(null)).toBe(null);
  });
});

describe('applyFilters', () => {
  const base = [
    a({ match_date: '2026-04-18', signal_type: 'LG1_A', confidence: 'fort', status: 'validated', league_name: 'L1' }),
    a({ match_date: '2026-04-19', signal_type: 'LG2_B', confidence: 'moyen', status: 'lost',     league_name: 'L2' }),
    a({ match_date: '2026-04-20', signal_type: 'LG2_A', confidence: 'moyen', status: 'validated', league_name: 'L1' }),
    a({ match_date: '2026-04-21', signal_type: 'LG1_B', confidence: 'moyen', status: 'pending',  league_name: 'L1' }),
    a({ match_date: '2026-04-22', signal_type: 'LG1_A', confidence: 'moyen', status: 'validated', league_name: 'L1' }),
  ];

  it('retourne tout si filtres tous par défaut (sauf statut terminees)', () => {
    const r = applyFilters(base, { status: 'terminees' });
    expect(r.length).toBe(4); // exclut le pending
  });

  it('filtre par stratégie LG1', () => {
    const r = applyFilters(base, { strategy: 'lg1', status: 'tous' });
    expect(r.length).toBe(3);
    expect(r.every(x => strategyOf(x) === 'LG1')).toBe(true);
  });

  it('filtre par stratégie LG2', () => {
    const r = applyFilters(base, { strategy: 'lg2', status: 'tous' });
    expect(r.length).toBe(2);
    expect(r.every(x => strategyOf(x) === 'LG2')).toBe(true);
  });

  it('filtre par confidence', () => {
    const r = applyFilters(base, { confidence: 'fort', status: 'tous' });
    expect(r.length).toBe(1);
  });

  it('filtre par date range', () => {
    const r = applyFilters(base, { dateFrom: '2026-04-19', dateTo: '2026-04-21', status: 'tous' });
    expect(r.length).toBe(3);
  });

  it('filtre par ligue', () => {
    const r = applyFilters(base, { league: 'L1', status: 'tous' });
    expect(r.length).toBe(4);
  });

  it('filtre par équipe (home ou away)', () => {
    const withHome = [...base, a({ home_team_id: 99, away_team_id: 100, home_team_name: 'X', away_team_name: 'Y' })];
    const r = applyFilters(withHome, { team: 99, status: 'tous' });
    expect(r.length).toBe(1);
    const r2 = applyFilters(withHome, { team: 100, status: 'tous' });
    expect(r2.length).toBe(1);
  });

  it('AND strict : stratégie + confidence + ligue + statut', () => {
    const r = applyFilters(base, { strategy: 'lg1', confidence: 'fort', league: 'L1', status: 'validated' });
    expect(r.length).toBe(1);
    expect(r[0].match_date).toBe('2026-04-18');
  });

  it('status validated / lost / encours', () => {
    expect(applyFilters(base, { status: 'validated' }).length).toBe(3);
    expect(applyFilters(base, { status: 'lost' }).length).toBe(1);   // LG2_B est lost
    expect(applyFilters(base, { status: 'encours' }).length).toBe(1);
  });

  it('retourne [] si input non-tableau', () => {
    expect(applyFilters(null, {})).toEqual([]);
    expect(applyFilters(undefined, {})).toEqual([]);
  });
});

describe('aggregateByStrategy', () => {
  it('compte validés/perdus par stratégie et calcule pct', () => {
    const alerts = [
      a({ signal_type: 'LG1_A', status: 'validated' }),
      a({ signal_type: 'LG1_B', status: 'validated' }),
      a({ signal_type: 'LG1_A', status: 'lost' }),
      a({ signal_type: 'LG2_A', status: 'validated' }),
      a({ signal_type: 'LG2_B', status: 'lost' }),
    ];
    const r = aggregateByStrategy(alerts);
    expect(r.LG1).toEqual({ validated: 2, lost: 1, total: 3, pct: 67 });
    expect(r.LG2).toEqual({ validated: 1, lost: 1, total: 2, pct: 50 });
    expect(r.DC).toBeUndefined();
  });

  it('pct=null si total=0', () => {
    const r = aggregateByStrategy([]);
    expect(r.LG1.pct).toBeNull();
    expect(r.LG2.pct).toBeNull();
    expect(r.DC).toBeUndefined();
  });

  it('ignore les pending', () => {
    const r = aggregateByStrategy([a({ status: 'pending' })]);
    expect(r.LG1.total).toBe(0);
  });
});

describe('aggregateByTeam', () => {
  it('compte validés/perdus pour home ET away (chaque équipe du match participe au résultat)', () => {
    const alerts = [
      a({ home_team_id: 1, home_team_name: 'A', away_team_id: 2, away_team_name: 'B', status: 'validated' }),
      a({ home_team_id: 1, home_team_name: 'A', away_team_id: 3, away_team_name: 'C', status: 'validated' }),
      a({ home_team_id: 2, home_team_name: 'B', away_team_id: 1, away_team_name: 'A', status: 'lost' }),
    ];
    const r = aggregateByTeam(alerts, { minMatches: 1, topN: 10 });
    const byId = Object.fromEntries(r.map(x => [x.teamId, x]));
    // Équipe 1 : alertes 1+2 validated, alerte 3 lost → 2v/1l
    expect(byId[1]).toMatchObject({ validated: 2, lost: 1, total: 3, pct: 67 });
    // Équipe 2 : alerte 1 validated, alerte 3 lost → 1v/1l
    expect(byId[2]).toMatchObject({ validated: 1, lost: 1, total: 2, pct: 50 });
    // Équipe 3 : alerte 2 validated → 1v/0l
    expect(byId[3]).toMatchObject({ validated: 1, lost: 0, total: 1, pct: 100 });
  });

  it('respecte minMatches (équipes avec moins masquées)', () => {
    const alerts = [
      a({ home_team_id: 1, home_team_name: 'A', away_team_id: 2, away_team_name: 'B' }),
    ];
    expect(aggregateByTeam(alerts, { minMatches: 3 }).length).toBe(0);
    expect(aggregateByTeam(alerts, { minMatches: 1 }).length).toBe(2);
  });

  it('respecte topN', () => {
    const alerts = Array.from({ length: 20 }, (_, i) =>
      a({ home_team_id: i, home_team_name: `T${i}`, away_team_id: 999, away_team_name: 'Other', status: 'validated' })
    );
    const r = aggregateByTeam(alerts, { minMatches: 1, topN: 5 });
    expect(r.length).toBe(5);
  });

  it('tri desc par pct, puis total, puis nom', () => {
    // Team A et team B : 2 victoires chacun, même pct (100%), même total (2)
    // L'équipe adverse 99 n'est pas comptée (son minMatches dépasse avec 4 matchs, mais
    // elle se classerait d'abord par total ; on la filtre ici en ne prenant que home = teams testées).
    // → on utilise des adversaires distincts pour isoler le tri A/B à même pct/total.
    const alerts = [
      a({ home_team_id: 1, home_team_name: 'B', away_team_id: 10, away_team_name: 'Z', status: 'validated' }),
      a({ home_team_id: 1, home_team_name: 'B', away_team_id: 11, away_team_name: 'Z', status: 'validated' }),
      a({ home_team_id: 2, home_team_name: 'A', away_team_id: 12, away_team_name: 'Z', status: 'validated' }),
      a({ home_team_id: 2, home_team_name: 'A', away_team_id: 13, away_team_name: 'Z', status: 'validated' }),
    ];
    // Équipes 1 et 2 : pct 100, total 2 → tri alphabétique : A (id=2) avant B (id=1)
    const r = aggregateByTeam(alerts, { minMatches: 2 });
    expect(r[0].teamName).toBe('A');
    expect(r[1].teamName).toBe('B');
  });
});

describe('aggregateByLeague', () => {
  it('compte validés/perdus par ligue', () => {
    const alerts = [
      a({ league_name: 'L1', status: 'validated' }),
      a({ league_name: 'L1', status: 'validated' }),
      a({ league_name: 'L1', status: 'lost' }),
      a({ league_name: 'L2', status: 'validated' }),
    ];
    const r = aggregateByLeague(alerts, { minMatches: 1 });
    const byName = Object.fromEntries(r.map(x => [x.leagueName, x]));
    expect(byName.L1).toMatchObject({ validated: 2, lost: 1, total: 3, pct: 67 });
    expect(byName.L2).toMatchObject({ validated: 1, lost: 0, total: 1, pct: 100 });
  });

  it('tri desc par pct', () => {
    const alerts = [
      a({ league_name: 'L1', status: 'lost' }),
      a({ league_name: 'L1', status: 'validated' }),
      a({ league_name: 'L2', status: 'validated' }),
      a({ league_name: 'L2', status: 'validated' }),
    ];
    const r = aggregateByLeague(alerts, { minMatches: 1 });
    expect(r[0].leagueName).toBe('L2');
    expect(r[1].leagueName).toBe('L1');
  });
});

describe('aggregateByDate', () => {
  it('bucket par jour', () => {
    const alerts = [
      a({ match_date: '2026-04-20', signal_type: 'LG1_A', status: 'validated' }),
      a({ match_date: '2026-04-20', signal_type: 'LG2_A', status: 'lost' }),
      a({ match_date: '2026-04-21', signal_type: 'LG1_A', status: 'validated' }),
    ];
    const r = aggregateByDate(alerts, 'jour');
    expect(r.length).toBe(2);
    expect(r[0].bucket).toBe('2026-04-20');
    expect(r[0].LG1).toEqual({ v: 1, t: 1 });
    expect(r[0].LG2).toEqual({ v: 0, t: 1 });
    expect(r[0].DC).toBeUndefined();
    expect(r[1].LG1).toEqual({ v: 1, t: 1 });
  });

  it('bucket par mois', () => {
    const alerts = [
      a({ match_date: '2026-04-05', signal_type: 'LG1_A', status: 'validated' }),
      a({ match_date: '2026-04-25', signal_type: 'LG1_A', status: 'lost' }),
      a({ match_date: '2026-05-10', signal_type: 'LG1_A', status: 'validated' }),
    ];
    const r = aggregateByDate(alerts, 'mois');
    expect(r.length).toBe(2);
    expect(r[0].bucket).toBe('2026-04');
    expect(r[0].LG1).toEqual({ v: 1, t: 2 });
    expect(r[1].bucket).toBe('2026-05');
  });

  it('bucket par annee', () => {
    const alerts = [
      a({ match_date: '2025-12-31', signal_type: 'LG1_A', status: 'validated' }),
      a({ match_date: '2026-01-01', signal_type: 'LG1_A', status: 'validated' }),
    ];
    const r = aggregateByDate(alerts, 'annee');
    expect(r.length).toBe(2);
    expect(r[0].bucket).toBe('2025');
    expect(r[1].bucket).toBe('2026');
  });

  it('trié ascendant', () => {
    const alerts = [
      a({ match_date: '2026-04-22', signal_type: 'LG1_A', status: 'validated' }),
      a({ match_date: '2026-04-20', signal_type: 'LG1_A', status: 'validated' }),
      a({ match_date: '2026-04-21', signal_type: 'LG1_A', status: 'validated' }),
    ];
    const r = aggregateByDate(alerts, 'jour');
    expect(r.map(x => x.bucket)).toEqual(['2026-04-20', '2026-04-21', '2026-04-22']);
  });

  it('ignore match_date null', () => {
    const r = aggregateByDate([a({ match_date: null })], 'jour');
    expect(r.length).toBe(0);
  });
});

describe('rateForBuckets', () => {
  it('pct calculé par bucket et stratégie', () => {
    const buckets = [
      { bucket: '2026-04-20', LG1: { v: 2, t: 3 }, LG2: { v: 0, t: 0 } },
    ];
    const r = rateForBuckets(buckets, 'LG1');
    expect(r[0]).toEqual({ bucket: '2026-04-20', pct: 67, v: 2, t: 3 });
  });

  it('pct=null si t=0', () => {
    const buckets = [{ bucket: '2026-04-20', LG1: { v: 0, t: 0 }, LG2: { v: 0, t: 0 } }];
    expect(rateForBuckets(buckets, 'LG1')[0].pct).toBeNull();
  });
});
