import { describe, it, expect } from 'vitest';
import {
  bestLg1,
  bestLg2,
  passesThreshold,
  dedupeLatestPerTeam,
  rankByPotential,
  filterTeamsByPotential,
} from './teamPotential.js';

// --- Mock data helpers ---

function makeRow(overrides = {}) {
  return {
    team_id: 1,
    team_name: 'Test Team',
    lg1_home_pct: 50,
    lg1_away_pct: 45,
    lg2_home_pct: 48,
    lg2_away_pct: 42,
    updated_at: '2026-05-30T00:00:00Z',
    ...overrides,
  };
}

// ============================================================================
// bestLg1 — Meilleur LG1% contextuel (max dom/ext)
// ============================================================================

describe('bestLg1', () => {
  describe('nominaux', () => {
    it('retourne le max quand home > away', () => {
      const row = makeRow({ lg1_home_pct: 60, lg1_away_pct: 55 });
      expect(bestLg1(row)).toBe(60);
    });

    it('retourne le max quand away > home', () => {
      const row = makeRow({ lg1_home_pct: 40, lg1_away_pct: 70 });
      expect(bestLg1(row)).toBe(70);
    });

    it('retourne la valeur quand home === away', () => {
      const row = makeRow({ lg1_home_pct: 55, lg1_away_pct: 55 });
      expect(bestLg1(row)).toBe(55);
    });
  });

  describe('null-safety', () => {
    it('retourne away quand home est null', () => {
      const row = makeRow({ lg1_home_pct: null, lg1_away_pct: 55 });
      expect(bestLg1(row)).toBe(55);
    });

    it('retourne home quand away est null', () => {
      const row = makeRow({ lg1_home_pct: 60, lg1_away_pct: null });
      expect(bestLg1(row)).toBe(60);
    });

    it('retourne null quand les deux sont null', () => {
      const row = makeRow({ lg1_home_pct: null, lg1_away_pct: null });
      expect(bestLg1(row)).toBeNull();
    });

    it('retourne null quand la row est undefined', () => {
      expect(bestLg1(undefined)).toBeNull();
    });

    it('retourne null quand la row est null', () => {
      expect(bestLg1(null)).toBeNull();
    });

    it('retourne null quand la row est {} (propriétés manquantes)', () => {
      expect(bestLg1({})).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('gère 0% correctement', () => {
      const row = makeRow({ lg1_home_pct: 0, lg1_away_pct: 0 });
      expect(bestLg1(row)).toBe(0);
    });

    it('gère 100% correctement', () => {
      const row = makeRow({ lg1_home_pct: 100, lg1_away_pct: 75 });
      expect(bestLg1(row)).toBe(100);
    });
  });
});

// ============================================================================
// bestLg2 — Meilleur LG2% contextuel (max dom/ext)
// ============================================================================

describe('bestLg2', () => {
  describe('nominaux', () => {
    it('retourne le max quand home > away', () => {
      const row = makeRow({ lg2_home_pct: 62, lg2_away_pct: 40 });
      expect(bestLg2(row)).toBe(62);
    });

    it('retourne le max quand away > home', () => {
      const row = makeRow({ lg2_home_pct: 35, lg2_away_pct: 65 });
      expect(bestLg2(row)).toBe(65);
    });
  });

  describe('null-safety', () => {
    it('retourne away quand home est null', () => {
      const row = makeRow({ lg2_home_pct: null, lg2_away_pct: 48 });
      expect(bestLg2(row)).toBe(48);
    });

    it('retourne null quand les deux sont null', () => {
      const row = makeRow({ lg2_home_pct: null, lg2_away_pct: null });
      expect(bestLg2(row)).toBeNull();
    });

    it('retourne null quand la row est undefined', () => {
      expect(bestLg2(undefined)).toBeNull();
    });
  });
});

// ============================================================================
// passesThreshold — Filtrage par seuils LG1/LG2
// ============================================================================

describe('passesThreshold', () => {
  describe('seuil LG1 seul', () => {
    it('passe si home >= seuil', () => {
      const row = makeRow({ lg1_home_pct: 60, lg1_away_pct: 40 });
      expect(passesThreshold(row, 55, null)).toBe(true);
    });

    it('passe si away >= seuil', () => {
      const row = makeRow({ lg1_home_pct: 40, lg1_away_pct: 60 });
      expect(passesThreshold(row, 55, null)).toBe(true);
    });

    it('passe si home OU away >= seuil (les deux conditions)', () => {
      const row = makeRow({ lg1_home_pct: 60, lg1_away_pct: 70 });
      expect(passesThreshold(row, 55, null)).toBe(true);
    });

    it('ne passe pas si aucun contexte >= seuil', () => {
      const row = makeRow({ lg1_home_pct: 40, lg1_away_pct: 50 });
      expect(passesThreshold(row, 55, null)).toBe(false);
    });

    it('passe si home === seuil exactement', () => {
      const row = makeRow({ lg1_home_pct: 55, lg1_away_pct: 0 });
      expect(passesThreshold(row, 55, null)).toBe(true);
    });

    it('gère home null / away >= seuil', () => {
      const row = makeRow({ lg1_home_pct: null, lg1_away_pct: 60 });
      expect(passesThreshold(row, 55, null)).toBe(true);
    });

    it('passe si home === null et away === null', () => {
      const row = makeRow({ lg1_home_pct: null, lg1_away_pct: null });
      expect(passesThreshold(row, 55, null)).toBe(false);
    });
  });

  describe('seuil LG2 seul', () => {
    it('passe si home >= seuil', () => {
      const row = makeRow({ lg2_home_pct: 52, lg2_away_pct: 30 });
      expect(passesThreshold(row, null, 50)).toBe(true);
    });

    it('passe si away >= seuil', () => {
      const row = makeRow({ lg2_home_pct: 30, lg2_away_pct: 52 });
      expect(passesThreshold(row, null, 50)).toBe(true);
    });

    it('ne passe pas si aucun contexte >= seuil', () => {
      const row = makeRow({ lg2_home_pct: 45, lg2_away_pct: 40 });
      expect(passesThreshold(row, null, 50)).toBe(false);
    });
  });

  describe('les deux seuils (OU logique)', () => {
    it('passe si LG1 ok ET LG2 ok', () => {
      const row = makeRow({
        lg1_home_pct: 60,
        lg1_away_pct: 40,
        lg2_home_pct: 52,
        lg2_away_pct: 30,
      });
      expect(passesThreshold(row, 55, 50)).toBe(true);
    });

    it('passe si LG1 ok meme si LG2 ko (OU)', () => {
      const row = makeRow({
        lg1_home_pct: 60,
        lg1_away_pct: 40,
        lg2_home_pct: 45,
        lg2_away_pct: 30,
      });
      expect(passesThreshold(row, 55, 50)).toBe(true);
    });

    it('passe si LG2 ok meme si LG1 ko (OU)', () => {
      const row = makeRow({
        lg1_home_pct: 50,
        lg1_away_pct: 40,
        lg2_home_pct: 52,
        lg2_away_pct: 30,
      });
      expect(passesThreshold(row, 55, 50)).toBe(true);
    });

    it('ne passe pas si LG1 ko ET LG2 ko', () => {
      const row = makeRow({
        lg1_home_pct: 50,
        lg1_away_pct: 40,
        lg2_home_pct: 45,
        lg2_away_pct: 30,
      });
      expect(passesThreshold(row, 55, 50)).toBe(false);
    });

    it('passe si les deux seuils ok avec away pour LG1 et home pour LG2', () => {
      const row = makeRow({
        lg1_home_pct: 40,
        lg1_away_pct: 60,
        lg2_home_pct: 52,
        lg2_away_pct: 30,
      });
      expect(passesThreshold(row, 55, 50)).toBe(true);
    });
  });

  describe('seuils null', () => {
    it('retourne false si les deux seuils sont null', () => {
      const row = makeRow({ lg1_home_pct: 100, lg1_away_pct: 100, lg2_home_pct: 100, lg2_away_pct: 100 });
      expect(passesThreshold(row, null, null)).toBe(false);
    });
  });

  describe('row invalide', () => {
    it('retourne false si row est null', () => {
      expect(passesThreshold(null, 55, null)).toBe(false);
    });

    it('retourne false si row est undefined', () => {
      expect(passesThreshold(undefined, 55, 50)).toBe(false);
    });

    it('retourne false si row est {} (propriétés manquantes)', () => {
      expect(passesThreshold({}, 55, 50)).toBe(false);
    });
  });
});

// ============================================================================
// dedupeLatestPerTeam — Déduplique par team_id, garde la plus récente
// ============================================================================

describe('dedupeLatestPerTeam', () => {
  describe('nominaux', () => {
    it('garde une seule ligne si un seul team_id', () => {
      const rows = [makeRow({ team_id: 1 })];
      const result = dedupeLatestPerTeam(rows);
      expect(result).toHaveLength(1);
      expect(result[0].team_id).toBe(1);
    });

    it('garde plusieurs team_id distincts', () => {
      const rows = [
        makeRow({ team_id: 1, lg1_home_pct: 50 }),
        makeRow({ team_id: 2, lg1_home_pct: 60 }),
        makeRow({ team_id: 3, lg1_home_pct: 70 }),
      ];
      const result = dedupeLatestPerTeam(rows);
      expect(result).toHaveLength(3);
      expect(result.map(r => r.team_id).sort()).toEqual([1, 2, 3]);
    });

    it('garde la ligne la plus récente quand 2 lignes même team_id', () => {
      const rows = [
        makeRow({
          team_id: 1,
          team_name: 'Old',
          updated_at: '2025-08-01T00:00:00Z',
          lg1_home_pct: 30,
        }),
        makeRow({
          team_id: 1,
          team_name: 'New',
          updated_at: '2026-05-30T04:32:00Z',
          lg1_home_pct: 60,
        }),
      ];
      const result = dedupeLatestPerTeam(rows);
      expect(result).toHaveLength(1);
      expect(result[0].team_name).toBe('New');
      expect(result[0].lg1_home_pct).toBe(60);
    });

    it('déduplique correctement avec 3 saisons différentes du même team', () => {
      const rows = [
        makeRow({
          team_id: 5,
          updated_at: '2024-05-30T00:00:00Z',
          lg1_home_pct: 40,
        }),
        makeRow({
          team_id: 5,
          updated_at: '2025-05-30T00:00:00Z',
          lg1_home_pct: 50,
        }),
        makeRow({
          team_id: 5,
          updated_at: '2026-05-30T00:00:00Z',
          lg1_home_pct: 65,
        }),
      ];
      const result = dedupeLatestPerTeam(rows);
      expect(result).toHaveLength(1);
      expect(result[0].lg1_home_pct).toBe(65);
      expect(result[0].updated_at).toBe('2026-05-30T00:00:00Z');
    });

    it('mélange plusieurs teams et plusieurs lignes par team', () => {
      const rows = [
        makeRow({ team_id: 1, updated_at: '2025-05-30T00:00:00Z', lg1_home_pct: 30 }),
        makeRow({ team_id: 2, updated_at: '2026-05-30T00:00:00Z', lg1_home_pct: 70 }),
        makeRow({ team_id: 1, updated_at: '2026-05-30T00:00:00Z', lg1_home_pct: 55 }),
        makeRow({ team_id: 2, updated_at: '2025-05-30T00:00:00Z', lg1_home_pct: 40 }),
      ];
      const result = dedupeLatestPerTeam(rows);
      expect(result).toHaveLength(2);
      const team1 = result.find(r => r.team_id === 1);
      const team2 = result.find(r => r.team_id === 2);
      expect(team1.lg1_home_pct).toBe(55); // la plus récente
      expect(team2.lg1_home_pct).toBe(70); // la plus récente
    });
  });

  describe('edge cases', () => {
    it('retourne [] si tableau vide', () => {
      expect(dedupeLatestPerTeam([])).toEqual([]);
    });

    it('retourne [] si rows est null', () => {
      expect(dedupeLatestPerTeam(null)).toEqual([]);
    });

    it('retourne [] si rows est undefined', () => {
      expect(dedupeLatestPerTeam(undefined)).toEqual([]);
    });

    it('gère les updated_at identiques (garde le premier trouvé)', () => {
      const rows = [
        makeRow({
          team_id: 1,
          updated_at: '2026-05-30T00:00:00Z',
          lg1_home_pct: 50,
        }),
        makeRow({
          team_id: 1,
          updated_at: '2026-05-30T00:00:00Z',
          lg1_home_pct: 60,
        }),
      ];
      const result = dedupeLatestPerTeam(rows);
      expect(result).toHaveLength(1);
      // La logique dit : si égalité de date, elle n'est pas remplacée (car > n'est pas >=)
      // donc le premier du tableau est conservé
      expect(result[0].lg1_home_pct).toBe(50);
    });
  });

  describe('robustesse', () => {
    it("ne mute pas le tableau d'entrée", () => {
      const rows = [makeRow({ team_id: 1 }), makeRow({ team_id: 2 })];
      const original = [...rows];
      dedupeLatestPerTeam(rows);
      expect(rows).toEqual(original);
    });
  });
});

// ============================================================================
// rankByPotential — Trie par bestLg1 desc, puis bestLg2 desc
// ============================================================================

describe('rankByPotential', () => {
  describe('nominaux', () => {
    it('trie 3 équipes par bestLg1 décroissant', () => {
      const rows = [
        makeRow({ team_id: 1, lg1_home_pct: 50, lg1_away_pct: 45 }), // best LG1 = 50
        makeRow({ team_id: 2, lg1_home_pct: 70, lg1_away_pct: 60 }), // best LG1 = 70
        makeRow({ team_id: 3, lg1_home_pct: 55, lg1_away_pct: 40 }), // best LG1 = 55
      ];
      const result = rankByPotential(rows);
      expect(result[0].team_id).toBe(2); // 70
      expect(result[1].team_id).toBe(3); // 55
      expect(result[2].team_id).toBe(1); // 50
    });

    it('utilise bestLg2 comme tiebreaker quand bestLg1 égal', () => {
      const rows = [
        makeRow({
          team_id: 1,
          lg1_home_pct: 60,
          lg1_away_pct: 55,
          lg2_home_pct: 40,
          lg2_away_pct: 35,
        }), // LG1=60, LG2=40
        makeRow({
          team_id: 2,
          lg1_home_pct: 60,
          lg1_away_pct: 50,
          lg2_home_pct: 55,
          lg2_away_pct: 50,
        }), // LG1=60, LG2=55
      ];
      const result = rankByPotential(rows);
      expect(result[0].team_id).toBe(2); // LG1=60, LG2=55 (mieux)
      expect(result[1].team_id).toBe(1); // LG1=60, LG2=40
    });
  });

  describe('null handling', () => {
    it('place les équipes avec bestLg1=null en dernier', () => {
      const rows = [
        makeRow({ team_id: 1, lg1_home_pct: 60, lg1_away_pct: 55 }), // LG1=60
        makeRow({
          team_id: 2,
          lg1_home_pct: null,
          lg1_away_pct: null,
          lg2_home_pct: 50,
          lg2_away_pct: 45,
        }), // LG1=null
        makeRow({ team_id: 3, lg1_home_pct: 65, lg1_away_pct: 50 }), // LG1=65
      ];
      const result = rankByPotential(rows);
      expect(result[0].team_id).toBe(3); // 65
      expect(result[1].team_id).toBe(1); // 60
      expect(result[2].team_id).toBe(2); // null
    });

    it('gère le cas où tous les LG1 sont null', () => {
      const rows = [
        makeRow({
          team_id: 1,
          lg1_home_pct: null,
          lg1_away_pct: null,
          lg2_home_pct: 50,
          lg2_away_pct: 40,
        }), // LG2=50
        makeRow({
          team_id: 2,
          lg1_home_pct: null,
          lg1_away_pct: null,
          lg2_home_pct: 60,
          lg2_away_pct: 50,
        }), // LG2=60
      ];
      const result = rankByPotential(rows);
      expect(result[0].team_id).toBe(2); // LG2=60
      expect(result[1].team_id).toBe(1); // LG2=50
    });
  });

  describe('robustesse', () => {
    it("ne mute pas le tableau d'entrée", () => {
      const rows = [
        makeRow({ team_id: 1, lg1_home_pct: 50 }),
        makeRow({ team_id: 2, lg1_home_pct: 60 }),
      ];
      const original = [...rows];
      rankByPotential(rows);
      expect(rows).toEqual(original);
    });

    it('retourne [] si tableau vide', () => {
      expect(rankByPotential([])).toEqual([]);
    });

    it('retourne [] si rows est null', () => {
      expect(rankByPotential(null)).toEqual([]);
    });

    it('retourne [] si rows est undefined', () => {
      expect(rankByPotential(undefined)).toEqual([]);
    });
  });
});

// ============================================================================
// filterTeamsByPotential — Pipeline complet : déddup + filtre + tri
// ============================================================================

describe('filterTeamsByPotential', () => {
  describe('nominaux', () => {
    it('retourne [] si les deux seuils sont null', () => {
      const rows = [
        makeRow({ team_id: 1, lg1_home_pct: 60 }),
        makeRow({ team_id: 2, lg1_home_pct: 70 }),
      ];
      expect(filterTeamsByPotential(rows, null, null)).toEqual([]);
    });

    it('filtre avec seuil LG1 uniquement', () => {
      const rows = [
        makeRow({ team_id: 1, lg1_home_pct: 50, lg1_away_pct: 40 }),
        makeRow({ team_id: 2, lg1_home_pct: 70, lg1_away_pct: 60 }),
        makeRow({ team_id: 3, lg1_home_pct: 48, lg1_away_pct: 35 }),
      ];
      const result = filterTeamsByPotential(rows, 55, null);
      expect(result).toHaveLength(1);
      expect(result[0].team_id).toBe(2); // seule équipe > 55
    });

    it('filtre avec seuil LG2 uniquement', () => {
      const rows = [
        makeRow({
          team_id: 1,
          lg1_home_pct: 50,
          lg2_home_pct: 45,
          lg2_away_pct: 40,
        }),
        makeRow({
          team_id: 2,
          lg1_home_pct: 70,
          lg2_home_pct: 52,
          lg2_away_pct: 48,
        }),
      ];
      const result = filterTeamsByPotential(rows, null, 50);
      expect(result).toHaveLength(1);
      expect(result[0].team_id).toBe(2);
    });

    it('filtre avec les deux seuils en OU (LG1 OU LG2 suffit)', () => {
      const rows = [
        makeRow({
          team_id: 1,
          lg1_home_pct: 60,
          lg1_away_pct: 40,
          lg2_home_pct: 45,
          lg2_away_pct: 30,
        }), // LG1 ok (60), LG2 ko (45) -> passe via LG1
        makeRow({
          team_id: 2,
          lg1_home_pct: 70,
          lg1_away_pct: 50,
          lg2_home_pct: 52,
          lg2_away_pct: 48,
        }), // LG1 ok (70), LG2 ok (52) -> passe
        makeRow({
          team_id: 3,
          lg1_home_pct: 40,
          lg1_away_pct: 35,
          lg2_home_pct: 55,
          lg2_away_pct: 50,
        }), // LG1 ko (40), LG2 ok (55) -> passe via LG2
      ];
      const result = filterTeamsByPotential(rows, 55, 50);
      // OU : les 3 passent (chacune atteint au moins un des deux seuils)
      expect(result).toHaveLength(3);
      // Tri par bestLg1 desc : team 2 (70) > team 1 (60) > team 3 (40)
      expect(result.map(r => r.team_id)).toEqual([2, 1, 3]);
    });
  });

  describe('cas critique : dédup prime sur filtre', () => {
    it('la ligne plus récente est utilisée pour le filtre', () => {
      const rows = [
        makeRow({
          team_id: 1,
          updated_at: '2025-05-30T00:00:00Z', // Ancienne saison
          lg1_home_pct: 70, // passe le seuil
          lg1_away_pct: 60,
        }),
        makeRow({
          team_id: 1,
          updated_at: '2026-05-30T00:00:00Z', // Saison courante
          lg1_home_pct: 40, // ne passe PAS le seuil
          lg1_away_pct: 35,
        }),
      ];
      const result = filterTeamsByPotential(rows, 55, null);
      // La ligne la plus récente (2026-05-30) doit être utilisée.
      // Elle ne passe pas le seuil, donc l'équipe est exclue.
      expect(result).toHaveLength(0);
    });

    it("l'ancienne saison est ignorée si plus récente passe le filtre", () => {
      const rows = [
        makeRow({
          team_id: 1,
          updated_at: '2025-05-30T00:00:00Z',
          lg1_home_pct: 40,
          lg1_away_pct: 35,
        }),
        makeRow({
          team_id: 1,
          updated_at: '2026-05-30T00:00:00Z',
          lg1_home_pct: 70,
          lg1_away_pct: 60,
        }),
      ];
      const result = filterTeamsByPotential(rows, 55, null);
      expect(result).toHaveLength(1);
      expect(result[0].updated_at).toBe('2026-05-30T00:00:00Z');
    });
  });

  describe('résultats triés par potentiel', () => {
    it('retourne les équipes triées par LG1 décroissant', () => {
      const rows = [
        makeRow({ team_id: 1, lg1_home_pct: 55, lg1_away_pct: 50 }),
        makeRow({ team_id: 2, lg1_home_pct: 75, lg1_away_pct: 60 }),
        makeRow({ team_id: 3, lg1_home_pct: 65, lg1_away_pct: 58 }),
      ];
      const result = filterTeamsByPotential(rows, 50, null);
      expect(result).toHaveLength(3);
      expect(result[0].team_id).toBe(2); // 75
      expect(result[1].team_id).toBe(3); // 65
      expect(result[2].team_id).toBe(1); // 55
    });

    it('tiebreak avec LG2 quand LG1 égal', () => {
      const rows = [
        makeRow({
          team_id: 1,
          lg1_home_pct: 60,
          lg1_away_pct: 55,
          lg2_home_pct: 40,
          lg2_away_pct: 30,
        }),
        makeRow({
          team_id: 2,
          lg1_home_pct: 60,
          lg1_away_pct: 55,
          lg2_home_pct: 55,
          lg2_away_pct: 50,
        }),
      ];
      const result = filterTeamsByPotential(rows, 50, 40);
      expect(result).toHaveLength(2);
      expect(result[0].team_id).toBe(2); // LG1=60, LG2=55
      expect(result[1].team_id).toBe(1); // LG1=60, LG2=40
    });
  });

  describe('edge cases', () => {
    it('retourne [] si tableau vide', () => {
      expect(filterTeamsByPotential([], 55, 50)).toEqual([]);
    });

    it('retourne [] si rows est null', () => {
      expect(filterTeamsByPotential(null, 55, 50)).toEqual([]);
    });

    it('retourne [] si rows est undefined', () => {
      expect(filterTeamsByPotential(undefined, 55, 50)).toEqual([]);
    });

    it('retourne [] si aucune équipe ne passe le filtre', () => {
      const rows = [
        makeRow({ team_id: 1, lg1_home_pct: 40, lg1_away_pct: 35 }),
        makeRow({ team_id: 2, lg1_home_pct: 45, lg1_away_pct: 40 }),
      ];
      const result = filterTeamsByPotential(rows, 55, null);
      expect(result).toEqual([]);
    });

    it('déduplique puis filtre puis trie un jeu complet', () => {
      const rows = [
        // Team 1 : deux saisons, plus récente passe
        makeRow({
          team_id: 1,
          updated_at: '2025-05-30T00:00:00Z',
          lg1_home_pct: 70,
          lg1_away_pct: 60,
        }),
        makeRow({
          team_id: 1,
          updated_at: '2026-05-30T00:00:00Z',
          lg1_home_pct: 65,
          lg1_away_pct: 58,
        }),
        // Team 2 : deux saisons, plus récente ne passe pas
        makeRow({
          team_id: 2,
          updated_at: '2025-05-30T00:00:00Z',
          lg1_home_pct: 75,
          lg1_away_pct: 70,
        }),
        makeRow({
          team_id: 2,
          updated_at: '2026-05-30T00:00:00Z',
          lg1_home_pct: 45,
          lg1_away_pct: 40,
        }),
        // Team 3 : une saison, passe
        makeRow({
          team_id: 3,
          updated_at: '2026-05-30T00:00:00Z',
          lg1_home_pct: 80,
          lg1_away_pct: 75,
        }),
      ];
      const result = filterTeamsByPotential(rows, 55, null);
      // Après dédup : team1=65, team2=45, team3=80
      // Après filtre (>= 55) : team1, team3
      // Après tri : team3 (80), team1 (65)
      expect(result).toHaveLength(2);
      expect(result[0].team_id).toBe(3);
      expect(result[1].team_id).toBe(1);
    });
  });
});
