import { describe, it, expect } from 'vitest';
import { analyserH2H, formaterH2HTimeline, getBadgeH2H } from './h2h.js';

// ============================================================
// analyserH2H
// ============================================================
describe('analyserH2H', () => {
  it('returns insuffisant with message when h2h is empty', () => {
    const result = analyserH2H([], 'Team A');
    expect(result.statut).toBe('insuffisant');
    expect(result.couleur).toBe('gris');
    expect(result.butsEnPremiereMT).toBe(0);
    expect(result.nbH2H).toBe(0);
    expect(result.exclu).toBe(false);
    expect(result.message).toBe('Aucun H2H disponible');
  });

  it('returns insuffisant when h2h is undefined (default)', () => {
    const result = analyserH2H();
    expect(result.statut).toBe('insuffisant');
    expect(result.nbH2H).toBe(0);
  });

  it('returns insuffisant when fewer than minH2H matches', () => {
    const h2h = [
      { equipe_ciblee_but_avant_45min: true },
      { equipe_ciblee_but_avant_45min: false },
    ];
    const result = analyserH2H(h2h, 'Team A', 3);
    expect(result.statut).toBe('insuffisant');
    expect(result.couleur).toBe('gris');
    expect(result.butsEnPremiereMT).toBe(1);
    expect(result.nbH2H).toBe(2);
    expect(result.exclu).toBe(false);
    expect(result.message).toContain('2/3');
  });

  it('returns exclusion when 0 buts en 1MT with enough H2H', () => {
    const h2h = [
      { equipe_ciblee_but_avant_45min: false },
      { equipe_ciblee_but_avant_45min: false },
      { equipe_ciblee_but_avant_45min: false },
    ];
    const result = analyserH2H(h2h, 'Team A', 3);
    expect(result.statut).toBe('exclusion');
    expect(result.couleur).toBe('rouge');
    expect(result.butsEnPremiereMT).toBe(0);
    expect(result.exclu).toBe(true);
    expect(result.message).toContain('Clean Sheet H2H');
  });

  it('returns defavorable when exactly 1 but en 1MT', () => {
    const h2h = [
      { equipe_ciblee_but_avant_45min: true },
      { equipe_ciblee_but_avant_45min: false },
      { equipe_ciblee_but_avant_45min: false },
      { equipe_ciblee_but_avant_45min: false },
    ];
    const result = analyserH2H(h2h, 'Team A', 3);
    expect(result.statut).toBe('defavorable');
    expect(result.couleur).toBe('orange');
    expect(result.butsEnPremiereMT).toBe(1);
    expect(result.exclu).toBe(false);
    expect(result.message).toContain('warning orange');
  });

  it('returns favorable when 2+ buts en 1MT', () => {
    const h2h = [
      { equipe_ciblee_but_avant_45min: true },
      { equipe_ciblee_but_avant_45min: true },
      { equipe_ciblee_but_avant_45min: false },
    ];
    const result = analyserH2H(h2h, 'Team A', 3);
    expect(result.statut).toBe('favorable');
    expect(result.couleur).toBe('vert');
    expect(result.butsEnPremiereMT).toBe(2);
    expect(result.exclu).toBe(false);
    expect(result.message).toContain('FAVORABLE');
  });

  it('uses custom minH2H threshold', () => {
    const h2h = [
      { equipe_ciblee_but_avant_45min: true },
      { equipe_ciblee_but_avant_45min: true },
      { equipe_ciblee_but_avant_45min: true },
      { equipe_ciblee_but_avant_45min: true },
    ];
    // With minH2H=5, 4 matches is insufficient
    const result = analyserH2H(h2h, 'Team A', 5);
    expect(result.statut).toBe('insuffisant');
    expect(result.nbH2H).toBe(4);
  });

  it('handles null equipe_ciblee_but_avant_45min values', () => {
    const h2h = [
      { equipe_ciblee_but_avant_45min: null },
      { equipe_ciblee_but_avant_45min: undefined },
      { equipe_ciblee_but_avant_45min: false },
    ];
    const result = analyserH2H(h2h, 'Team A', 3);
    // null/undefined are not === true, so 0 buts
    expect(result.statut).toBe('exclusion');
    expect(result.butsEnPremiereMT).toBe(0);
    expect(result.exclu).toBe(true);
  });

  it('pluralizes confrontation correctly for single match exclusion', () => {
    const h2h = [{ equipe_ciblee_but_avant_45min: false }];
    const result = analyserH2H(h2h, 'Team A', 1);
    expect(result.message).toContain('1 confrontation');
    expect(result.message).not.toContain('confrontations');
  });

  it('pluralizes confrontations for multiple match exclusion', () => {
    const h2h = [
      { equipe_ciblee_but_avant_45min: false },
      { equipe_ciblee_but_avant_45min: false },
      { equipe_ciblee_but_avant_45min: false },
    ];
    const result = analyserH2H(h2h, 'Team A', 3);
    expect(result.message).toContain('confrontations');
  });
});

// ============================================================
// formaterH2HTimeline
// ============================================================
describe('formaterH2HTimeline', () => {
  it('returns empty array for empty input', () => {
    expect(formaterH2HTimeline([])).toEqual([]);
  });

  it('returns empty array for undefined input', () => {
    expect(formaterH2HTimeline()).toEqual([]);
  });

  it('formats matches correctly', () => {
    const h2h = [{
      date: '2024-01-15',
      homeGoals: 2,
      awayGoals: 1,
      homeGoals_HT: 1,
      awayGoals_HT: 0,
      equipe_ciblee_but_avant_45min: true,
      goals: [{ minute: 10 }],
    }];
    const result = formaterH2HTimeline(h2h, 'Team A');
    expect(result).toHaveLength(1);
    expect(result[0].score).toBe('2-1');
    expect(result[0].htScore).toBe('MT: 1-0');
    expect(result[0].butMT).toBe(true);
    expect(result[0].goals).toEqual([{ minute: 10 }]);
    expect(result[0].total).toBe(3);
  });

  it('only returns last 5 matches', () => {
    const h2h = Array.from({ length: 8 }, (_, i) => ({
      date: `2024-01-${String(i + 1).padStart(2, '0')}`,
      homeGoals: 1,
      awayGoals: 0,
      homeGoals_HT: 0,
      awayGoals_HT: 0,
      equipe_ciblee_but_avant_45min: false,
    }));
    const result = formaterH2HTimeline(h2h, 'Team A');
    expect(result).toHaveLength(5);
  });

  it('handles missing goals and scores gracefully', () => {
    const h2h = [{
      date: null,
      homeGoals: undefined,
      awayGoals: undefined,
      homeGoals_HT: undefined,
      awayGoals_HT: undefined,
      equipe_ciblee_but_avant_45min: null,
    }];
    const result = formaterH2HTimeline(h2h, 'Team A');
    expect(result).toHaveLength(1);
    expect(result[0].date).toBe('\u2014'); // em dash
    expect(result[0].butMT).toBe(false);
    expect(result[0].total).toBe(0);
  });
});

// ============================================================
// getBadgeH2H
// ============================================================
describe('getBadgeH2H', () => {
  it('returns grey badge for null input', () => {
    const badge = getBadgeH2H(null);
    expect(badge.icon).toBe('?');
    expect(badge.classe).toBe('badge--h2h-gris');
  });

  it('returns grey badge for undefined input', () => {
    const badge = getBadgeH2H(undefined);
    expect(badge.icon).toBe('?');
    expect(badge.classe).toBe('badge--h2h-gris');
  });

  it('returns green badge for vert couleur', () => {
    const badge = getBadgeH2H({ couleur: 'vert', butsEnPremiereMT: 3, nbH2H: 5 });
    expect(badge.icon).toBe('\u2713');
    expect(badge.classe).toBe('badge--h2h-vert');
    expect(badge.label).toContain('3/5');
  });

  it('returns orange badge for orange couleur', () => {
    const badge = getBadgeH2H({ couleur: 'orange', butsEnPremiereMT: 1, nbH2H: 4 });
    expect(badge.icon).toBe('\u26A0');
    expect(badge.classe).toBe('badge--h2h-orange');
    expect(badge.label).toContain('1/4');
  });

  it('returns exclu badge for rouge couleur', () => {
    const badge = getBadgeH2H({ couleur: 'rouge', butsEnPremiereMT: 0, nbH2H: 3 });
    expect(badge.icon).toBe('\u2717');
    expect(badge.classe).toBe('badge--exclu');
    expect(badge.label).toContain('0/3');
  });

  it('returns grey badge for unknown couleur', () => {
    const badge = getBadgeH2H({ couleur: 'bleu', butsEnPremiereMT: 2, nbH2H: 5 });
    expect(badge.icon).toBe('?');
    expect(badge.classe).toBe('badge--h2h-gris');
  });
});
