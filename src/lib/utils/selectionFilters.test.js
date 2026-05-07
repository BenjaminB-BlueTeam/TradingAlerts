import { describe, it, expect } from 'vitest';
import { keyOf, applyScopeFilter } from './selectionFilters.js';

describe('keyOf', () => {
  it('construit la clé "matchId:signalType" pour des entrées normales', () => {
    expect(keyOf(1, 'FHG_A')).toBe('1:FHG_A');
    expect(keyOf(42, 'LG2_A')).toBe('42:LG2_A');
  });

  it('gère un signal_type composite avec + sans casser la clé', () => {
    expect(keyOf(999, 'FHG_A+B')).toBe('999:FHG_A+B');
    expect(keyOf(123, 'LG2_A+B')).toBe('123:LG2_A+B');
  });
});

describe('applyScopeFilter', () => {
  describe('input validation', () => {
    it('retourne [] si alerts n\'est pas un tableau (null)', () => {
      expect(applyScopeFilter(null, new Set(), 'mine')).toEqual([]);
    });

    it('retourne [] si alerts n\'est pas un tableau (undefined)', () => {
      expect(applyScopeFilter(undefined, new Set(), 'mine')).toEqual([]);
    });

    it('retourne [] si alerts est un objet (pas array)', () => {
      expect(applyScopeFilter({ foo: 'bar' }, new Set(), 'mine')).toEqual([]);
    });
  });

  describe('scope=global', () => {
    it('retourne alerts inchangé même si selectedKeysSet est null', () => {
      const alerts = [
        { match_id: 1, signal_type: 'FHG_A' },
        { match_id: 2, signal_type: 'LG2_A' },
      ];
      expect(applyScopeFilter(alerts, null, 'global')).toEqual(alerts);
    });

    it('ignore complètement le Set (alertes hors Set toujours présentes)', () => {
      const alerts = [
        { match_id: 1, signal_type: 'FHG_A' },
        { match_id: 2, signal_type: 'LG2_A' },
      ];
      const selectedSet = new Set(['1:FHG_A']); // seulement une alerte sélectionnée
      expect(applyScopeFilter(alerts, selectedSet, 'global')).toEqual(alerts); // retourne les 2
    });
  });

  describe('scope undefined ou inconnu', () => {
    it('scope undefined : comportement === global (retourne tout)', () => {
      const alerts = [
        { match_id: 1, signal_type: 'FHG_A' },
        { match_id: 2, signal_type: 'LG2_A' },
      ];
      expect(applyScopeFilter(alerts, new Set(), undefined)).toEqual(alerts);
    });

    it('scope inconnu (ex: "foobar") : comportement === global', () => {
      const alerts = [
        { match_id: 1, signal_type: 'FHG_A' },
        { match_id: 2, signal_type: 'LG2_A' },
      ];
      expect(applyScopeFilter(alerts, new Set(), 'foobar')).toEqual(alerts);
    });
  });

  describe('scope=mine', () => {
    it('retourne [] si selectedKeysSet est null', () => {
      const alerts = [
        { match_id: 1, signal_type: 'FHG_A' },
        { match_id: 2, signal_type: 'LG2_A' },
      ];
      expect(applyScopeFilter(alerts, null, 'mine')).toEqual([]);
    });

    it('retourne [] si selectedKeysSet est vide', () => {
      const alerts = [
        { match_id: 1, signal_type: 'FHG_A' },
        { match_id: 2, signal_type: 'LG2_A' },
      ];
      expect(applyScopeFilter(alerts, new Set(), 'mine')).toEqual([]);
    });

    it('ne garde que les alertes dont (match_id, signal_type) matche le Set', () => {
      const alerts = [
        { match_id: 1, signal_type: 'FHG_A' },
        { match_id: 2, signal_type: 'LG2_B' },
        { match_id: 3, signal_type: 'LG2_A' },
      ];
      const selectedSet = new Set(['1:FHG_A', '3:LG2_A']);
      const result = applyScopeFilter(alerts, selectedSet, 'mine');
      expect(result).toEqual([
        { match_id: 1, signal_type: 'FHG_A' },
        { match_id: 3, signal_type: 'LG2_A' },
      ]);
    });

    it('préserve l\'ordre des alertes en entrée', () => {
      const alerts = [
        { match_id: 3, signal_type: 'C' },
        { match_id: 1, signal_type: 'A' },
        { match_id: 2, signal_type: 'B' },
      ];
      const selectedSet = new Set(['3:C', '1:A', '2:B']);
      const result = applyScopeFilter(alerts, selectedSet, 'mine');
      expect(result.map(a => a.match_id)).toEqual([3, 1, 2]); // ordre préservé
    });

    it('granularité fine : plusieurs alertes même match_id, signal_types différents', () => {
      const alerts = [
        { match_id: 1, signal_type: 'FHG_A' },
        { match_id: 1, signal_type: 'FHG_B' },
        { match_id: 1, signal_type: 'LG2_A' },
      ];
      const selectedSet = new Set(['1:FHG_A', '1:LG2_A']); // on sélectionne FHG_A et LG2_A, pas FHG_B
      const result = applyScopeFilter(alerts, selectedSet, 'mine');
      expect(result).toEqual([
        { match_id: 1, signal_type: 'FHG_A' },
        { match_id: 1, signal_type: 'LG2_A' },
      ]);
    });

    it('tableau vide en entrée retourne []', () => {
      const result = applyScopeFilter([], new Set(['1:FHG_A']), 'mine');
      expect(result).toEqual([]);
    });
  });
});
