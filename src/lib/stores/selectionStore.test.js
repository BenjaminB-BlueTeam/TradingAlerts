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
    expect(keyOf(1, 'LG1_A')).toBe('1:LG1_A');
    expect(keyOf(99, 'LG2_A')).toBe('99:LG2_A');
  });
});

describe('isSelected', () => {
  it('retourne false si set null', () => {
    expect(isSelected(null, 1, 'LG1_A')).toBe(false);
  });

  it('retourne false si set vide', () => {
    expect(isSelected(new Set(), 1, 'LG1_A')).toBe(false);
  });

  it('retourne true si la clé est dans le set', () => {
    const set = new Set(['1:LG1_A']);
    expect(isSelected(set, 1, 'LG1_A')).toBe(true);
  });

  it('retourne false si signal_type différent (granularité fine)', () => {
    const set = new Set(['1:LG1_A']);
    expect(isSelected(set, 1, 'LG1_B')).toBe(false);
    expect(isSelected(set, 1, 'LG2_A')).toBe(false);
  });
});

describe('loadSelections', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectedKeys.set(new Set());
  });

  it('hydrate selectedKeys depuis le retour de getSelectedAlerts', async () => {
    const mockData = [
      { match_id: 1, signal_type: 'LG1_A' },
      { match_id: 2, signal_type: 'LG2_B' },
      { match_id: 3, signal_type: 'LG2_A' },
    ];
    mockGetSelectedAlerts.mockResolvedValue(mockData);

    await loadSelections();

    const currentSet = get(selectedKeys);
    expect(currentSet.has('1:LG1_A')).toBe(true);
    expect(currentSet.has('2:LG2_B')).toBe(true);
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
      { match_id: 10, signal_type: 'LG1_B' },
      { match_id: 20, signal_type: 'LG1_A+B' },
    ];
    mockGetSelectedAlerts.mockResolvedValue(mockData);

    await loadSelections();

    const currentSet = get(selectedKeys);
    expect(currentSet.has('10:LG1_B')).toBe(true);
    expect(currentSet.has('20:LG1_A+B')).toBe(true);
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
    await select(1, 'LG1_A', null);

    expect(mockSelectAlert).toHaveBeenCalledOnce();
    expect(mockSelectAlert).toHaveBeenCalledWith(1, 'LG1_A', null);
    expect(get(selectedKeys).has('1:LG1_A')).toBe(true);
  });

  it('no-op si la clé est déjà présente : api.selectAlert n\'est PAS appelé', async () => {
    selectedKeys.set(new Set(['1:LG1_A']));

    await select(1, 'LG1_A', null);

    expect(mockSelectAlert).not.toHaveBeenCalled();
  });

  it('si api.selectAlert throw, l\'erreur est propagée et le Set n\'est pas modifié', async () => {
    mockSelectAlert.mockRejectedValue(new Error('API error'));

    await expect(select(1, 'LG1_A', null)).rejects.toThrow('API error');
    expect(get(selectedKeys).has('1:LG1_A')).toBe(false);
  });

  it('note est passée correctement à api.selectAlert quand fournie', async () => {
    await select(5, 'LG2_A', 'ma note perso');

    expect(mockSelectAlert).toHaveBeenCalledWith(5, 'LG2_A', 'ma note perso');
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

  it('cas nominal : appelle api.unselectAlert une fois et retire la clé du Set', async () => {
    selectedKeys.set(new Set(['1:LG1_A']));

    await unselect(1, 'LG1_A');

    expect(mockUnselectAlert).toHaveBeenCalledOnce();
    expect(mockUnselectAlert).toHaveBeenCalledWith(1, 'LG1_A');
    expect(get(selectedKeys).has('1:LG1_A')).toBe(false);
  });

  it('désélectionner LG2_A : appelle api.unselectAlert une fois et retire la clé', async () => {
    selectedKeys.set(new Set(['2:LG2_A']));

    await unselect(2, 'LG2_A');

    expect(mockUnselectAlert).toHaveBeenCalledOnce();
    expect(mockUnselectAlert).toHaveBeenCalledWith(2, 'LG2_A');
    expect(get(selectedKeys).has('2:LG2_A')).toBe(false);
  });

  it('désélectionner LG1_B : n\'affecte pas les autres signaux du même match', async () => {
    selectedKeys.set(new Set(['3:LG1_B', '3:LG2_A']));

    await unselect(3, 'LG1_B');

    expect(mockUnselectAlert).toHaveBeenCalledOnce();
    expect(mockUnselectAlert).toHaveBeenCalledWith(3, 'LG1_B');
    expect(get(selectedKeys).has('3:LG1_B')).toBe(false);
    expect(get(selectedKeys).has('3:LG2_A')).toBe(true); // LG2_A n'est pas affecté
  });

  it('désélectionner LG1_A+B : retire uniquement cette clé', async () => {
    selectedKeys.set(new Set(['4:LG1_A+B', '4:LG2_B']));

    await unselect(4, 'LG1_A+B');

    expect(mockUnselectAlert).toHaveBeenCalledOnce();
    expect(mockUnselectAlert).toHaveBeenCalledWith(4, 'LG1_A+B');
    expect(get(selectedKeys).has('4:LG1_A+B')).toBe(false);
    expect(get(selectedKeys).has('4:LG2_B')).toBe(true);
  });

  it('si api.unselectAlert throw, l\'erreur est propagée', async () => {
    selectedKeys.set(new Set(['5:LG1_A']));
    mockUnselectAlert.mockRejectedValue(new Error('API error'));

    await expect(unselect(5, 'LG1_A')).rejects.toThrow('API error');
  });
});
