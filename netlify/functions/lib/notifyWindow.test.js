import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  LG1_OFFSET_SEC,
  LG2_OFFSET_SEC,
  WINDOW_WIDTH_SEC,
  computeKickoffWindow,
  isInLiveWindow,
  matchesFamily,
  confidenceRank,
  dedupeByMatch,
} = require('./notifyWindow.cjs');

describe('notifyWindow — constantes', () => {
  it('LG1_OFFSET_SEC = 1800 (30 min)', () => {
    expect(LG1_OFFSET_SEC).toBe(1800);
  });

  it('LG2_OFFSET_SEC = 5700 (95 min)', () => {
    expect(LG2_OFFSET_SEC).toBe(5700);
  });

  it('WINDOW_WIDTH_SEC = 300 (5 min)', () => {
    expect(WINDOW_WIDTH_SEC).toBe(300);
  });
});

describe('computeKickoffWindow', () => {
  it('retourne { start, end } avec offset et largeur par défaut', () => {
    const nowUnix = 10000;
    const result = computeKickoffWindow(nowUnix, LG1_OFFSET_SEC);
    expect(result.start).toBe(10000 - 1800 - 300); // 7900
    expect(result.end).toBe(10000 - 1800);         // 8200
  });

  it('calcul exact : nowUnix=10000, offset=1800 → {start: 7900, end: 8200}', () => {
    const result = computeKickoffWindow(10000, 1800);
    expect(result).toEqual({ start: 7900, end: 8200 });
  });

  it('accepte widthSec custom : nowUnix=10000, offset=1800, widthSec=600 → {start: 7600, end: 8200}', () => {
    const result = computeKickoffWindow(10000, 1800, 600);
    expect(result).toEqual({ start: 7600, end: 8200 });
  });

  it('fonctionne avec LG2_OFFSET_SEC=5700 : {start: 4000, end: 4300}', () => {
    const result = computeKickoffWindow(10000, 5700);
    expect(result).toEqual({ start: 4000, end: 4300 });
  });

  it('widthSec=0 → start === end', () => {
    const result = computeKickoffWindow(10000, 1800, 0);
    expect(result.start).toBe(result.end);
    expect(result.end).toBe(8200);
  });
});

describe('isInLiveWindow', () => {
  describe('cas nominaux LG1 (offset=1800, width=300)', () => {
    it('elapsed=1800 (borne basse, incluse) → true', () => {
      const kickoffUnix = 10000 - 1800; // 8200
      const nowUnix = 10000;
      expect(isInLiveWindow(kickoffUnix, nowUnix, 1800)).toBe(true);
    });

    it('elapsed=2099 (avant borne haute) → true', () => {
      const kickoffUnix = 10000 - 2099; // 7901
      const nowUnix = 10000;
      expect(isInLiveWindow(kickoffUnix, nowUnix, 1800)).toBe(true);
    });

    it('elapsed=2100 (borne haute, exclusive) → false', () => {
      const kickoffUnix = 10000 - 2100; // 7900
      const nowUnix = 10000;
      expect(isInLiveWindow(kickoffUnix, nowUnix, 1800)).toBe(false);
    });

    it('elapsed=1799 (trop tôt, avant borne basse) → false', () => {
      const kickoffUnix = 10000 - 1799; // 8201
      const nowUnix = 10000;
      expect(isInLiveWindow(kickoffUnix, nowUnix, 1800)).toBe(false);
    });
  });

  describe('cas nominaux LG2 (offset=5700, width=300)', () => {
    it('elapsed=5700 (borne basse incluse) → true', () => {
      const kickoffUnix = 10000 - 5700; // 4300
      const nowUnix = 10000;
      expect(isInLiveWindow(kickoffUnix, nowUnix, 5700)).toBe(true);
    });

    it('elapsed=5999 (dans fenêtre LG2, avant borne haute) → true', () => {
      const kickoffUnix = 10000 - 5999; // 4001
      const nowUnix = 10000;
      expect(isInLiveWindow(kickoffUnix, nowUnix, 5700)).toBe(true);
    });

    it('elapsed=6001 (borne haute exclusive) → false', () => {
      const kickoffUnix = 10000 - 6001; // 3999
      const nowUnix = 10000;
      expect(isInLiveWindow(kickoffUnix, nowUnix, 5700)).toBe(false);
    });
  });

  describe('falsy kickoffUnix', () => {
    it('kickoffUnix = 0 → false', () => {
      expect(isInLiveWindow(0, 10000, 1800)).toBe(false);
    });

    it('kickoffUnix = null → false', () => {
      expect(isInLiveWindow(null, 10000, 1800)).toBe(false);
    });

    it('kickoffUnix = undefined → false', () => {
      expect(isInLiveWindow(undefined, 10000, 1800)).toBe(false);
    });
  });

  describe('widthSec custom', () => {
    it('widthSec=600 → elapsed dans [1800, 2400[', () => {
      const kickoffUnix = 10000 - 1800; // borne basse
      expect(isInLiveWindow(kickoffUnix, 10000, 1800, 600)).toBe(true);

      const kickoffUnix2 = 10000 - 2400; // borne haute exclusive
      expect(isInLiveWindow(kickoffUnix2, 10000, 1800, 600)).toBe(false);

      const kickoffUnix3 = 10000 - 2399; // juste avant borne haute
      expect(isInLiveWindow(kickoffUnix3, 10000, 1800, 600)).toBe(true);
    });
  });
});

describe('matchesFamily', () => {
  describe('family = "LG2"', () => {
    it('LG2_A → true', () => {
      expect(matchesFamily('LG2_A', 'LG2')).toBe(true);
    });

    it('LG2_B → true', () => {
      expect(matchesFamily('LG2_B', 'LG2')).toBe(true);
    });

    it('LG2_A+B → true', () => {
      expect(matchesFamily('LG2_A+B', 'LG2')).toBe(true);
    });

    it('LG2_MANUAL → true', () => {
      expect(matchesFamily('LG2_MANUAL', 'LG2')).toBe(true);
    });

    it('LG1_A → false', () => {
      expect(matchesFamily('LG1_A', 'LG2')).toBe(false);
    });

    it('LG1_B → false', () => {
      expect(matchesFamily('LG1_B', 'LG2')).toBe(false);
    });

    it('LG1_A+B → false', () => {
      expect(matchesFamily('LG1_A+B', 'LG2')).toBe(false);
    });

    it('LG1_C → false', () => {
      expect(matchesFamily('LG1_C', 'LG2')).toBe(false);
    });

    it('LG1_D → false', () => {
      expect(matchesFamily('LG1_D', 'LG2')).toBe(false);
    });

    it('STAT_COMBO (ne commence pas par LG2) → false', () => {
      expect(matchesFamily('STAT_COMBO', 'LG2')).toBe(false);
    });
  });

  describe('family = "LG1"', () => {
    it('LG1_A → true', () => {
      expect(matchesFamily('LG1_A', 'LG1')).toBe(true);
    });

    it('LG1_B → true', () => {
      expect(matchesFamily('LG1_B', 'LG1')).toBe(true);
    });

    it('LG1_A+B → true', () => {
      expect(matchesFamily('LG1_A+B', 'LG1')).toBe(true);
    });

    it('LG1_C → true', () => {
      expect(matchesFamily('LG1_C', 'LG1')).toBe(true);
    });

    it('LG1_D → true', () => {
      expect(matchesFamily('LG1_D', 'LG1')).toBe(true);
    });

    it('LG1_MANUAL → true', () => {
      expect(matchesFamily('LG1_MANUAL', 'LG1')).toBe(true);
    });

    it('LG2_A → false', () => {
      expect(matchesFamily('LG2_A', 'LG1')).toBe(false);
    });

    it('LG2_B → false', () => {
      expect(matchesFamily('LG2_B', 'LG1')).toBe(false);
    });

    it('LG2_A+B → false', () => {
      expect(matchesFamily('LG2_A+B', 'LG1')).toBe(false);
    });

    it('LG2_MANUAL → false', () => {
      expect(matchesFamily('LG2_MANUAL', 'LG1')).toBe(false);
    });

    it('STAT_COMBO (ne commence pas par LG2) → true', () => {
      expect(matchesFamily('STAT_COMBO', 'LG1')).toBe(true);
    });
  });

  describe('falsy signalType', () => {
    it('signalType = "" → false', () => {
      expect(matchesFamily('', 'LG1')).toBe(false);
      expect(matchesFamily('', 'LG2')).toBe(false);
    });

    it('signalType = null → false', () => {
      expect(matchesFamily(null, 'LG1')).toBe(false);
      expect(matchesFamily(null, 'LG2')).toBe(false);
    });

    it('signalType = undefined → false', () => {
      expect(matchesFamily(undefined, 'LG1')).toBe(false);
      expect(matchesFamily(undefined, 'LG2')).toBe(false);
    });
  });
});

describe('confidenceRank', () => {
  describe('valeurs nominales', () => {
    it('fort → 2', () => {
      expect(confidenceRank('fort')).toBe(2);
    });

    it('moyen → 1', () => {
      expect(confidenceRank('moyen')).toBe(1);
    });
  });

  describe('valeurs invalides / null', () => {
    it('null → 0', () => {
      expect(confidenceRank(null)).toBe(0);
    });

    it('undefined → 0', () => {
      expect(confidenceRank(undefined)).toBe(0);
    });

    it('"autre" → 0', () => {
      expect(confidenceRank('autre')).toBe(0);
    });

    it('"FORT" (majuscule) → 0', () => {
      expect(confidenceRank('FORT')).toBe(0);
    });

    it('"" (chaîne vide) → 0', () => {
      expect(confidenceRank('')).toBe(0);
    });
  });
});

describe('dedupeByMatch', () => {
  describe('cas nominaux', () => {
    it('tableau vide → []', () => {
      expect(dedupeByMatch([])).toEqual([]);
    });

    it('une alerte → retourne cette alerte', () => {
      const alerts = [{ match_id: 1, signal_type: 'LG1_A', confidence: 'fort' }];
      const result = dedupeByMatch(alerts);
      expect(result).toEqual(alerts);
    });

    it('deux matchs distincts → conserve les deux', () => {
      const alerts = [
        { match_id: 1, signal_type: 'LG1_A', confidence: 'fort' },
        { match_id: 2, signal_type: 'LG1_B', confidence: 'moyen' },
      ];
      const result = dedupeByMatch(alerts);
      expect(result).toHaveLength(2);
      expect(result.some((a) => a.match_id === 1)).toBe(true);
      expect(result.some((a) => a.match_id === 2)).toBe(true);
    });
  });

  describe('déduplication : même match_id, confiance différente', () => {
    it('garde le signal "fort" parmi [fort, moyen]', () => {
      const alerts = [
        { match_id: 123, signal_type: 'LG1_A', confidence: 'fort' },
        { match_id: 123, signal_type: 'LG1_B', confidence: 'moyen' },
      ];
      const result = dedupeByMatch(alerts);
      expect(result).toHaveLength(1);
      expect(result[0].confidence).toBe('fort');
      expect(result[0].signal_type).toBe('LG1_A');
    });

    it('garde le signal "fort" même s\'il arrive APRÈS "moyen"', () => {
      const alerts = [
        { match_id: 123, signal_type: 'LG1_B', confidence: 'moyen' },
        { match_id: 123, signal_type: 'LG1_A', confidence: 'fort' },
      ];
      const result = dedupeByMatch(alerts);
      expect(result).toHaveLength(1);
      expect(result[0].confidence).toBe('fort');
      expect(result[0].signal_type).toBe('LG1_A');
    });

    it('garde le signal "moyen" parmi [moyen, null]', () => {
      const alerts = [
        { match_id: 456, signal_type: 'LG2_A', confidence: 'moyen' },
        { match_id: 456, signal_type: 'LG1_MANUAL', confidence: null },
      ];
      const result = dedupeByMatch(alerts);
      expect(result).toHaveLength(1);
      expect(result[0].confidence).toBe('moyen');
      expect(result[0].signal_type).toBe('LG2_A');
    });

    it('garde le signal "moyen" même s\'il arrive APRÈS null', () => {
      const alerts = [
        { match_id: 456, signal_type: 'LG1_MANUAL', confidence: null },
        { match_id: 456, signal_type: 'LG2_A', confidence: 'moyen' },
      ];
      const result = dedupeByMatch(alerts);
      expect(result).toHaveLength(1);
      expect(result[0].confidence).toBe('moyen');
      expect(result[0].signal_type).toBe('LG2_A');
    });
  });

  describe('déduplication : même match_id, confiance égale', () => {
    it('garde le PREMIER en cas d\'égalité (deux "moyen")', () => {
      const alerts = [
        { match_id: 789, signal_type: 'LG1_A', confidence: 'moyen', id: 'first' },
        { match_id: 789, signal_type: 'LG1_B', confidence: 'moyen', id: 'second' },
      ];
      const result = dedupeByMatch(alerts);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('first');
    });

    it('garde le PREMIER en cas d\'égalité (deux null)', () => {
      const alerts = [
        { match_id: 999, signal_type: 'LG1_MANUAL', confidence: null, order: 1 },
        { match_id: 999, signal_type: 'LG2_MANUAL', confidence: null, order: 2 },
      ];
      const result = dedupeByMatch(alerts);
      expect(result).toHaveLength(1);
      expect(result[0].order).toBe(1);
    });
  });

  describe('déduplication : trois alerts même match', () => {
    it('[fort, moyen, null] → garde le fort', () => {
      const alerts = [
        { match_id: 111, confidence: 'fort', id: 'a' },
        { match_id: 111, confidence: 'moyen', id: 'b' },
        { match_id: 111, confidence: null, id: 'c' },
      ];
      const result = dedupeByMatch(alerts);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('a');
    });

    it('[moyen, moyen, fort] → garde le fort (peu importe l\'ordre)', () => {
      const alerts = [
        { match_id: 222, confidence: 'moyen', id: 'x' },
        { match_id: 222, confidence: 'moyen', id: 'y' },
        { match_id: 222, confidence: 'fort', id: 'z' },
      ];
      const result = dedupeByMatch(alerts);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('z');
    });
  });

  describe('ordre de retour préservé (insertion Map)', () => {
    it('retourne dans l\'ordre d\'apparition du premier match_id', () => {
      const alerts = [
        { match_id: 3, signal_type: 'LG1_A', confidence: 'fort' },
        { match_id: 1, signal_type: 'LG1_B', confidence: 'moyen' },
        { match_id: 3, signal_type: 'LG1_C', confidence: 'moyen' }, // dédupliqué, 3 reste premier
        { match_id: 2, signal_type: 'LG2_A', confidence: 'fort' },
      ];
      const result = dedupeByMatch(alerts);
      expect(result).toHaveLength(3);
      expect(result[0].match_id).toBe(3);
      expect(result[1].match_id).toBe(1);
      expect(result[2].match_id).toBe(2);
    });
  });

  describe('cas complexes multi-match', () => {
    it('mélange de plusieurs matchs avec déduplications croisées', () => {
      const alerts = [
        { match_id: 'A', signal_type: 'LG1_A', confidence: 'moyen' },
        { match_id: 'B', signal_type: 'LG2_A', confidence: 'fort' },
        { match_id: 'A', signal_type: 'LG1_B', confidence: 'fort' }, // A : moyen → fort
        { match_id: 'C', signal_type: 'LG1_C', confidence: null },
        { match_id: 'B', signal_type: 'LG2_B', confidence: 'moyen' }, // B : fort conservé
      ];
      const result = dedupeByMatch(alerts);
      expect(result).toHaveLength(3);

      const byMatchId = Object.fromEntries(result.map((a) => [a.match_id, a]));
      expect(byMatchId['A'].confidence).toBe('fort');
      expect(byMatchId['A'].signal_type).toBe('LG1_B');
      expect(byMatchId['B'].confidence).toBe('fort');
      expect(byMatchId['B'].signal_type).toBe('LG2_A');
      expect(byMatchId['C'].confidence).toBe(null);
    });
  });
});
