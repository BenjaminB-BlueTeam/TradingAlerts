import { beforeEach, describe, it, expect, vi } from 'vitest';
import { get } from 'svelte/store';

// ---- Mock supabase module ----
const mockSelectAlert = vi.fn();
const mockUnselectAlert = vi.fn();
const mockGetSelectedAlerts = vi.fn();

vi.mock('$lib/api/supabase.js', () => ({
  selectAlert: (...args) => mockSelectAlert(...args),
  unselectAlert: (...args) => mockUnselectAlert(...args),
  getSelectedAlerts: (...args) => mockGetSelectedAlerts(...args),
}));

const { selectedKeys, select, unselect, isSelected, keyOf, loadSelections } = await import('./selectionStore.js');

describe('keyOf (re-export)', () => {
  it('re-export depuis selectionFilters fonctionnel', () => {
    expect(keyOf(1, 'FHG_A')).toBe('1:FHG_A');
    expect(keyOf(99, 'DC')).toBe('99:DC');
  });
});

describe('isSelected', () => {
  it('retourne false si set null', () => {
    expect(isSelected(null, 1, 'FHG_A')).toBe(false);
  });

  it('retourne false si set vide', () => {
    expect(isSelected(new Set(), 1, 'FHG_A')).toBe(false);
  });

  it('retourne true si la clé est dans le set', () => {
    const set = new Set(['1:FHG_A']);
    expect(isSelected(set, 1, 'FHG_A')).toBe(true);
  });

  it('retourne false si signal_type différent (granularité fine)', () => {
    const set = new Set(['1:FHG_A']);
    expect(isSelected(set, 1, 'FHG_B')).toBe(false);
    expect(isSelected(set, 1, 'DC')).toBe(false);
  });
});

describe('loadSelections', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectedKeys.set(new Set());
  });

  it('hydrate selectedKeys depuis le retour de getSelectedAlerts', async () => {
    const mockData = [
      { match_id: 1, signal_type: 'FHG_A' },
      { match_id: 2, signal_type: 'DC' },
      { match_id: 3, signal_type: 'LG2_A' },
    ];
    mockGetSelectedAlerts.mockResolvedValue(mockData);

    await loadSelections();

    const currentSet = get(selectedKeys);
    expect(currentSet.has('1:FHG_A')).toBe(true);
    expect(currentSet.has('2:DC')).toBe(true);
    expect(currentSet.has('3:LG2_A')).toBe(true);
  });

  it('si getSelectedAlerts retourne [], le store contient un Set vide', async () => {
    mockGetSelectedAlerts.mockResolvedValue([]);

    await loadSelections();

    const currentSet = get(selectedKeys);
    expect(currentSet.size).toBe(0);
  });

  it('le Set produit utilise bien keyOf(match_id, signal_type) pour chaque ligne', async () => {
    const mockData = [
      { match_id: 10, signal_type: 'FHG_B' },
      { match_id: 20, signal_type: 'FHG_A+B' },
    ];
    mockGetSelectedAlerts.mockResolvedValue(mockData);

    await loadSelections();

    const currentSet = get(selectedKeys);
    expect(currentSet.has('10:FHG_B')).toBe(true);
    expect(currentSet.has('20:FHG_A+B')).toBe(true);
    expect(currentSet.size).toBe(2);
  });
});

describe('select', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectedKeys.set(new Set());
    mockSelectAlert.mockResolvedValue(undefined);
    mockUnselectAlert.mockResolvedValue(undefined);
  });

  it('appelle api.selectAlert une fois et ajoute la clé au Set', async () => {
    await select(1, 'FHG_A', null);

    expect(mockSelectAlert).toHaveBeenCalledOnce();
    expect(mockSelectAlert).toHaveBeenCalledWith(1, 'FHG_A', null);
    expect(get(selectedKeys).has('1:FHG_A')).toBe(true);
  });

  it('no-op si la clé est déjà présente : api.selectAlert n\'est PAS appelé', async () => {
    selectedKeys.set(new Set(['1:FHG_A']));

    await select(1, 'FHG_A', null);

    expect(mockSelectAlert).not.toHaveBeenCalled();
  });

  it('si api.selectAlert throw, l\'erreur est propagée et le Set n\'est pas modifié', async () => {
    mockSelectAlert.mockRejectedValue(new Error('API error'));

    await expect(select(1, 'FHG_A', null)).rejects.toThrow('API error');
    expect(get(selectedKeys).has('1:FHG_A')).toBe(false);
  });

  it('note est passée correctement à api.selectAlert quand fournie', async () => {
    await select(5, 'DC', 'ma note perso');

    expect(mockSelectAlert).toHaveBeenCalledWith(5, 'DC', 'ma note perso');
  });

  it('note défaut à null si non fournie', async () => {
    await select(7, 'LG2_A');

    expect(mockSelectAlert).toHaveBeenCalledWith(7, 'LG2_A', null);
  });
});

describe('unselect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectedKeys.set(new Set());
    mockSelectAlert.mockResolvedValue(undefined);
    mockUnselectAlert.mockResolvedValue(undefined);
  });

  it('cas nominal sans cascade : appelle api.unselectAlert une fois, retire la clé, retourne cascadedDC: false', async () => {
    selectedKeys.set(new Set(['1:DC']));

    const result = await unselect(1, 'DC');

    expect(mockUnselectAlert).toHaveBeenCalledOnce();
    expect(mockUnselectAlert).toHaveBeenCalledWith(1, 'DC');
    expect(get(selectedKeys).has('1:DC')).toBe(false);
    expect(result).toEqual({ cascadedDC: false });
  });

  it('cascade FHG → DC : si on désélectionne FHG_A et que DC du même match est sélectionné', async () => {
    selectedKeys.set(new Set(['1:FHG_A', '1:DC']));

    const result = await unselect(1, 'FHG_A');

    // api.unselectAlert appelé 2 fois : FHG_A, puis DC
    expect(mockUnselectAlert).toHaveBeenCalledTimes(2);
    expect(mockUnselectAlert).toHaveBeenNthCalledWith(1, 1, 'FHG_A');
    expect(mockUnselectAlert).toHaveBeenNthCalledWith(2, 1, 'DC');
    // Les deux clés sont retirées du Set
    expect(get(selectedKeys).has('1:FHG_A')).toBe(false);
    expect(get(selectedKeys).has('1:DC')).toBe(false);
    // Retourne cascadedDC: true
    expect(result).toEqual({ cascadedDC: true });
  });

  it('cascade FHG → DC : si on désélectionne FHG_A mais qu\'il n\'y a PAS de DC, pas de cascade', async () => {
    selectedKeys.set(new Set(['1:FHG_A']));

    const result = await unselect(1, 'FHG_A');

    expect(mockUnselectAlert).toHaveBeenCalledOnce();
    expect(mockUnselectAlert).toHaveBeenCalledWith(1, 'FHG_A');
    expect(get(selectedKeys).has('1:FHG_A')).toBe(false);
    expect(result).toEqual({ cascadedDC: false });
  });

  it('désélection d\'un signal qui ne commence pas par FHG (ex: DC direct) : pas de cascade', async () => {
    selectedKeys.set(new Set(['1:DC', '1:FHG_A']));

    const result = await unselect(1, 'DC');

    expect(mockUnselectAlert).toHaveBeenCalledOnce();
    expect(mockUnselectAlert).toHaveBeenCalledWith(1, 'DC');
    expect(get(selectedKeys).has('1:DC')).toBe(false);
    expect(get(selectedKeys).has('1:FHG_A')).toBe(true); // FHG_A n'est pas affecté
    expect(result).toEqual({ cascadedDC: false });
  });

  it('désélection d\'une variante FHG (FHG_B, FHG_A+B) : la cascade s\'applique aussi', async () => {
    selectedKeys.set(new Set(['2:FHG_B', '2:DC']));

    const result = await unselect(2, 'FHG_B');

    expect(mockUnselectAlert).toHaveBeenCalledTimes(2);
    expect(mockUnselectAlert).toHaveBeenNthCalledWith(1, 2, 'FHG_B');
    expect(mockUnselectAlert).toHaveBeenNthCalledWith(2, 2, 'DC');
    expect(result).toEqual({ cascadedDC: true });
  });

  it('cascade FHG_A+B → DC du même match', async () => {
    selectedKeys.set(new Set(['3:FHG_A+B', '3:DC']));

    const result = await unselect(3, 'FHG_A+B');

    expect(mockUnselectAlert).toHaveBeenCalledTimes(2);
    expect(mockUnselectAlert).toHaveBeenNthCalledWith(1, 3, 'FHG_A+B');
    expect(mockUnselectAlert).toHaveBeenNthCalledWith(2, 3, 'DC');
    expect(result).toEqual({ cascadedDC: true });
  });

  it('LG2_A ne provoque pas de cascade (ne commence pas par FHG)', async () => {
    selectedKeys.set(new Set(['4:LG2_A', '4:DC']));

    const result = await unselect(4, 'LG2_A');

    expect(mockUnselectAlert).toHaveBeenCalledOnce();
    expect(mockUnselectAlert).toHaveBeenCalledWith(4, 'LG2_A');
    expect(get(selectedKeys).has('4:DC')).toBe(true); // DC n'est pas affecté
    expect(result).toEqual({ cascadedDC: false });
  });
});
