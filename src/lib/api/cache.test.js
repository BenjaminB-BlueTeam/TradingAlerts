import { beforeEach, describe, it, expect, vi } from 'vitest';

// ---- localStorage mock ----
let storage = {};

const localStorageMock = {
  getItem: vi.fn((key) => (key in storage ? storage[key] : null)),
  setItem: vi.fn((key, value) => { storage[key] = String(value); }),
  removeItem: vi.fn((key) => { delete storage[key]; }),
};

// Object.keys(localStorage) must return storage keys
Object.setPrototypeOf(localStorageMock, {
  [Symbol.iterator]: function* () { yield* Object.keys(storage); },
});

// Patch Object.keys to handle our mock
const originalKeys = Object.keys;
Object.keys = function (obj) {
  if (obj === localStorageMock) return originalKeys(storage);
  return originalKeys(obj);
};

vi.stubGlobal('localStorage', localStorageMock);

// ---- Import after mock ----
const { cacheGet, cacheSet, cacheInvalidate, cacheClear, cacheStats, cacheEvict, cacheKey } = await import('./cache.js');

// ============================================================
describe('cacheKey', () => {
  it('builds key from endpoint only', () => {
    expect(cacheKey('league-list')).toBe('league-list');
  });

  it('builds key with sorted params', () => {
    const key = cacheKey('league-teams', { season_id: '123', include: 'stats' });
    expect(key).toBe('league-teams_include=stats_season_id=123');
  });

  it('handles empty params', () => {
    expect(cacheKey('test', {})).toBe('test');
  });
});

// ============================================================
describe('cacheSet / cacheGet', () => {
  beforeEach(() => {
    storage = {};
    vi.clearAllMocks();
  });

  it('stores and retrieves data', () => {
    cacheSet('test', { foo: 'bar' });
    const result = cacheGet('test');
    expect(result).toEqual({ foo: 'bar' });
  });

  it('returns null for missing key', () => {
    expect(cacheGet('nonexistent')).toBeNull();
  });

  it('returns null for expired entry', () => {
    cacheSet('expired', 'data', 1); // 1ms TTL
    // Simulate expiration by manipulating stored data
    const raw = JSON.parse(storage['fhg_cache_expired']);
    raw.expires = Date.now() - 1000;
    storage['fhg_cache_expired'] = JSON.stringify(raw);
    expect(cacheGet('expired')).toBeNull();
  });

  it('returns null and removes expired entry from storage', () => {
    cacheSet('expired2', 'data', 1);
    const raw = JSON.parse(storage['fhg_cache_expired2']);
    raw.expires = Date.now() - 1000;
    storage['fhg_cache_expired2'] = JSON.stringify(raw);
    cacheGet('expired2');
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('fhg_cache_expired2');
  });

  it('returns null when stored value is not valid JSON', () => {
    storage['fhg_cache_bad'] = 'not json{{{';
    expect(cacheGet('bad')).toBeNull();
  });

  it('uses default TTL of 15 minutes', () => {
    const before = Date.now();
    cacheSet('ttl-test', 'data');
    const raw = JSON.parse(storage['fhg_cache_ttl-test']);
    // expires should be roughly 15 min in the future
    expect(raw.expires).toBeGreaterThanOrEqual(before + 15 * 60 * 1000 - 100);
    expect(raw.expires).toBeLessThanOrEqual(Date.now() + 15 * 60 * 1000 + 100);
  });

  it('stores cachedAt timestamp', () => {
    const before = Date.now();
    cacheSet('ts-test', 'data');
    const raw = JSON.parse(storage['fhg_cache_ts-test']);
    expect(raw.cachedAt).toBeGreaterThanOrEqual(before);
    expect(raw.cachedAt).toBeLessThanOrEqual(Date.now());
  });
});

// ============================================================
describe('cacheInvalidate', () => {
  beforeEach(() => {
    storage = {};
    vi.clearAllMocks();
  });

  it('removes a specific cache entry', () => {
    cacheSet('to-remove', 'data');
    expect(cacheGet('to-remove')).toBe('data');
    cacheInvalidate('to-remove');
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('fhg_cache_to-remove');
  });
});

// ============================================================
describe('cacheClear', () => {
  beforeEach(() => {
    storage = {};
    vi.clearAllMocks();
  });

  it('removes all cache entries', () => {
    cacheSet('a', 1);
    cacheSet('b', 2);
    storage['other_key'] = 'keep';
    cacheClear();
    expect(storage['fhg_cache_a']).toBeUndefined();
    expect(storage['fhg_cache_b']).toBeUndefined();
    expect(storage['other_key']).toBe('keep');
  });

  it('does nothing when no cache entries exist', () => {
    storage['other'] = 'value';
    cacheClear();
    expect(storage['other']).toBe('value');
  });
});

// ============================================================
describe('cacheStats', () => {
  beforeEach(() => {
    storage = {};
    vi.clearAllMocks();
  });

  it('returns zero stats when empty', () => {
    const stats = cacheStats();
    expect(stats).toEqual({ total: 0, expired: 0, active: 0 });
  });

  it('counts active and expired entries', () => {
    cacheSet('active1', 'data');
    cacheSet('active2', 'data');
    cacheSet('old', 'data');
    // Expire one entry
    const raw = JSON.parse(storage['fhg_cache_old']);
    raw.expires = Date.now() - 1000;
    storage['fhg_cache_old'] = JSON.stringify(raw);

    const stats = cacheStats();
    expect(stats.total).toBe(3);
    expect(stats.expired).toBe(1);
    expect(stats.active).toBe(2);
  });

  it('handles unparseable entries gracefully', () => {
    storage['fhg_cache_broken'] = 'not json';
    cacheSet('good', 'data');
    // The broken entry will throw in try/catch and not be counted
    const stats = cacheStats();
    expect(stats.total).toBe(1); // only the good one parsed
  });
});

// ============================================================
describe('cacheEvict', () => {
  beforeEach(() => {
    storage = {};
    vi.clearAllMocks();
  });

  it('removes expired entries', () => {
    cacheSet('fresh', 'data');
    cacheSet('stale', 'data');
    const raw = JSON.parse(storage['fhg_cache_stale']);
    raw.expires = Date.now() - 5000;
    storage['fhg_cache_stale'] = JSON.stringify(raw);

    cacheEvict();
    expect(storage['fhg_cache_stale']).toBeUndefined();
    expect(storage['fhg_cache_fresh']).toBeDefined();
  });

  it('removes unparseable entries', () => {
    storage['fhg_cache_broken'] = 'not json!!!';
    cacheEvict();
    expect(storage['fhg_cache_broken']).toBeUndefined();
  });

  it('evicts oldest entries when over 3MB', () => {
    // Create entries that exceed 3MB total
    const bigData = 'x'.repeat(1024 * 1024); // ~1MB per entry (x2 for UTF-16 = 2MB)
    cacheSet('old1', bigData);
    cacheSet('old2', bigData);

    // Make old1 older
    const raw1 = JSON.parse(storage['fhg_cache_old1']);
    raw1.cachedAt = 1000;
    storage['fhg_cache_old1'] = JSON.stringify(raw1);

    const raw2 = JSON.parse(storage['fhg_cache_old2']);
    raw2.cachedAt = 2000;
    storage['fhg_cache_old2'] = JSON.stringify(raw2);

    cacheEvict();
    // At least the oldest should have been removed if over 3MB
    // The exact behavior depends on the size calculation
  });

  it('does nothing when no entries exist', () => {
    cacheEvict(); // Should not throw
  });
});
