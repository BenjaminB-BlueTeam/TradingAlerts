import { beforeEach, describe, it, expect, vi } from 'vitest';
import { get } from 'svelte/store';

// ---- Mock supabase module ----
const mockGetFavorites = vi.fn();
const mockAddFavoriteTeam = vi.fn();
const mockRemoveFavoriteTeam = vi.fn();

vi.mock('$lib/api/supabase.js', () => ({
  getFavorites: (...args) => mockGetFavorites(...args),
  addFavoriteTeam: (...args) => mockAddFavoriteTeam(...args),
  removeFavoriteTeam: (...args) => mockRemoveFavoriteTeam(...args),
}));

const { favoriteTeamIds, favoriteTeams, isFavorite, loadFavorites, addFavorite, removeFavorite } =
  await import('./favoritesStore.js');

describe('isFavorite (fonction PURE)', () => {
  describe('cas nominaux — Set avec données', () => {
    it('retourne true si teamId est dans le Set', () => {
      const set = new Set([1, 2, 3]);
      expect(isFavorite(set, 2)).toBe(true);
    });

    it('retourne false si teamId n\'est pas dans le Set', () => {
      const set = new Set([1, 2, 3]);
      expect(isFavorite(set, 9)).toBe(false);
    });

    it('retourne true avec multiple équipes', () => {
      const set = new Set([438, 439, 440, 441]);
      expect(isFavorite(set, 439)).toBe(true);
      expect(isFavorite(set, 441)).toBe(true);
      expect(isFavorite(set, 999)).toBe(false);
    });
  });

  describe('edge cases — Set vide ou invalide', () => {
    it('retourne false si favSet est null', () => {
      expect(isFavorite(null, 1)).toBe(false);
    });

    it('retourne false si favSet est undefined', () => {
      expect(isFavorite(undefined, 1)).toBe(false);
    });

    it('retourne false si favSet est un objet falsy', () => {
      expect(isFavorite(0, 1)).toBe(false);
      expect(isFavorite('', 1)).toBe(false);
      expect(isFavorite(false, 1)).toBe(false);
    });

    it('retourne false si Set est vide', () => {
      const set = new Set();
      expect(isFavorite(set, 1)).toBe(false);
    });
  });

  describe('edge cases — teamId invalide', () => {
    it('retourne false si teamId est null', () => {
      const set = new Set([1, 2, 3]);
      expect(isFavorite(set, null)).toBe(false);
    });

    it('retourne false si teamId est undefined', () => {
      const set = new Set([1, 2, 3]);
      expect(isFavorite(set, undefined)).toBe(false);
    });

    it('retourne true si teamId est 0 et que 0 est dans le Set (0 != null, donc non exclu)', () => {
      const set = new Set([0, 1, 2]);
      expect(isFavorite(set, 0)).toBe(true); // 0 == null vaut false -> 0 n'est pas exclu, et 0 est dans le Set
    });
  });

  describe('conversion string ↔ number — crucial', () => {
    it('retourne true si Set contient number et teamId est string du même nombre', () => {
      const set = new Set([438, 439, 440]);
      expect(isFavorite(set, '438')).toBe(true);
    });

    it('retourne true si Set contient multiple numbers et recherche avec string', () => {
      const set = new Set([1, 2, 3]);
      expect(isFavorite(set, '2')).toBe(true);
      expect(isFavorite(set, '1')).toBe(true);
      expect(isFavorite(set, '9')).toBe(false);
    });

    it('gère les strings avec leading zeros (Number conversion normalise)', () => {
      const set = new Set([438]);
      // Number('00438') === 438
      expect(isFavorite(set, '00438')).toBe(true);
    });

    it('retourne false si string ne convertit pas en nombre présent', () => {
      const set = new Set([438, 439]);
      expect(isFavorite(set, '999')).toBe(false);
    });

    it('string invalide → NaN → false', () => {
      const set = new Set([1, 2, 3]);
      // Number('abc') === NaN, NaN ne sera jamais dans un Set de nombres
      expect(isFavorite(set, 'abc')).toBe(false);
    });

    it('string vide → 0 en Number, donc false si 0 n\'est pas dans le Set', () => {
      const set = new Set([1, 2, 3]);
      // Number('') === 0
      expect(isFavorite(set, '')).toBe(false);
    });

    it('string vide → 0, true si Set contient 0', () => {
      const set = new Set([0, 1, 2]);
      expect(isFavorite(set, '')).toBe(true);
    });
  });

  describe('types mixtes dans le Set', () => {
    it('Set ne contient que des Number (pas de confusion de type)', () => {
      // La doc indique que loadFavorites map avec Number(), donc Set ne contient que des numbers
      const set = new Set([1, 2, 3]);
      expect(isFavorite(set, 2)).toBe(true);
      expect(isFavorite(set, '2')).toBe(true);
    });
  });

  describe('cas extrêmes — limites', () => {
    it('très grand team_id', () => {
      const set = new Set([999999999]);
      expect(isFavorite(set, 999999999)).toBe(true);
      expect(isFavorite(set, '999999999')).toBe(true);
    });

    it('team_id très grands exprimés en string', () => {
      const set = new Set([438]);
      expect(isFavorite(set, '438')).toBe(true);
    });
  });
});

describe('loadFavorites', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    favoriteTeams.set([]);
    favoriteTeamIds.set(new Set());
  });

  it('hydrate favoriteTeams et favoriteTeamIds depuis l\'API', async () => {
    const mockData = [
      { id: 1, team_id: 438, team_name: 'Paris SG', created_at: '2026-05-30T10:00:00Z' },
      { id: 2, team_id: 439, team_name: 'Marseille', created_at: '2026-05-29T10:00:00Z' },
    ];
    mockGetFavorites.mockResolvedValue(mockData);

    await loadFavorites();

    const teams = get(favoriteTeams);
    const ids = get(favoriteTeamIds);

    expect(teams).toEqual(mockData);
    expect(ids.has(438)).toBe(true);
    expect(ids.has(439)).toBe(true);
    expect(ids.size).toBe(2);
  });

  it('si l\'API retourne [], les deux stores contiennent des valeurs vides', async () => {
    mockGetFavorites.mockResolvedValue([]);

    await loadFavorites();

    expect(get(favoriteTeams)).toEqual([]);
    expect(get(favoriteTeamIds).size).toBe(0);
  });

  it('convertit team_id en Number lors de la construction du Set', async () => {
    const mockData = [
      { id: 1, team_id: '438', team_name: 'PSG', created_at: '2026-05-30T10:00:00Z' },
      { id: 2, team_id: '439', team_name: 'OM', created_at: '2026-05-29T10:00:00Z' },
    ];
    mockGetFavorites.mockResolvedValue(mockData);

    await loadFavorites();

    const ids = get(favoriteTeamIds);
    // Même si l'API retourne des strings, le Set contient des numbers
    expect(ids.has(438)).toBe(true);
    expect(ids.has(439)).toBe(true);
  });

  it('si api.getFavorites rejette, l\'erreur est propagée', async () => {
    mockGetFavorites.mockRejectedValue(new Error('Supabase error'));

    await expect(loadFavorites()).rejects.toThrow('Supabase error');
  });
});

describe('addFavorite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    favoriteTeamIds.set(new Set());
    mockAddFavoriteTeam.mockResolvedValue(undefined);
    mockGetFavorites.mockResolvedValue([]);
  });

  it('appelle api.addFavoriteTeam et recharge les favoris', async () => {
    mockGetFavorites.mockResolvedValue([
      { id: 1, team_id: 438, team_name: 'PSG', created_at: '2026-05-30T10:00:00Z' },
    ]);

    await addFavorite(438, 'PSG');

    expect(mockAddFavoriteTeam).toHaveBeenCalledOnce();
    expect(mockAddFavoriteTeam).toHaveBeenCalledWith(438, 'PSG');
    expect(mockGetFavorites).toHaveBeenCalledOnce();
    expect(get(favoriteTeamIds).has(438)).toBe(true);
  });

  it('no-op si teamId est déjà dans les favoris (pas d\'appel API)', async () => {
    favoriteTeamIds.set(new Set([438]));

    await addFavorite(438, 'PSG');

    expect(mockAddFavoriteTeam).not.toHaveBeenCalled();
    expect(mockGetFavorites).not.toHaveBeenCalled();
  });

  it('gère les string teamId et les convertit en Number pour la vérification', async () => {
    favoriteTeamIds.set(new Set([438]));

    await addFavorite('438', 'PSG');

    // String '438' est converti en Number 438, trouvé dans le Set, donc no-op
    expect(mockAddFavoriteTeam).not.toHaveBeenCalled();
  });

  it('teamName est optionnel et par défaut null', async () => {
    mockGetFavorites.mockResolvedValue([
      { id: 1, team_id: 438, team_name: null, created_at: '2026-05-30T10:00:00Z' },
    ]);

    await addFavorite(438);

    expect(mockAddFavoriteTeam).toHaveBeenCalledWith(438, null);
  });

  it('si api.addFavoriteTeam rejette, l\'erreur est propagée et aucun reload', async () => {
    mockAddFavoriteTeam.mockRejectedValue(new Error('API error'));

    await expect(addFavorite(438, 'PSG')).rejects.toThrow('API error');
    expect(mockGetFavorites).not.toHaveBeenCalled();
  });
});

describe('removeFavorite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    favoriteTeamIds.set(new Set([438, 439]));
    mockRemoveFavoriteTeam.mockResolvedValue(undefined);
    mockGetFavorites.mockResolvedValue([]);
  });

  it('appelle api.removeFavoriteTeam et recharge les favoris', async () => {
    mockGetFavorites.mockResolvedValue([
      { id: 2, team_id: 439, team_name: 'Marseille', created_at: '2026-05-29T10:00:00Z' },
    ]);

    await removeFavorite(438);

    expect(mockRemoveFavoriteTeam).toHaveBeenCalledOnce();
    expect(mockRemoveFavoriteTeam).toHaveBeenCalledWith(438);
    expect(mockGetFavorites).toHaveBeenCalledOnce();
    expect(get(favoriteTeamIds).has(438)).toBe(false);
    expect(get(favoriteTeamIds).has(439)).toBe(true);
  });

  it('gère les string teamId', async () => {
    mockGetFavorites.mockResolvedValue([
      { id: 2, team_id: 439, team_name: 'Marseille', created_at: '2026-05-29T10:00:00Z' },
    ]);

    await removeFavorite('438');

    expect(mockRemoveFavoriteTeam).toHaveBeenCalledWith('438');
  });

  it('si api.removeFavoriteTeam rejette, l\'erreur est propagée', async () => {
    mockRemoveFavoriteTeam.mockRejectedValue(new Error('API error'));

    await expect(removeFavorite(438)).rejects.toThrow('API error');
    expect(mockGetFavorites).not.toHaveBeenCalled();
  });
});
