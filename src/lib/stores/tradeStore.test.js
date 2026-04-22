import { beforeEach, describe, it, expect, vi } from 'vitest';

// ---- Mock localStorage ----
let storage = {};
vi.stubGlobal('localStorage', {
  getItem: vi.fn((k) => storage[k] || null),
  setItem: vi.fn((k, v) => { storage[k] = v; }),
  removeItem: vi.fn((k) => { delete storage[k]; }),
});

// ---- Mock svelte/store ----
function createMockWritable(initial) {
  let value = initial;
  const subscribers = [];
  return {
    subscribe(fn) {
      subscribers.push(fn);
      fn(value);
      return () => { subscribers.splice(subscribers.indexOf(fn), 1); };
    },
    set(v) { value = v; subscribers.forEach(fn => fn(v)); },
    update(fn) { value = fn(value); subscribers.forEach(fn2 => fn2(value)); },
    _get() { return value; },
  };
}

const mockTrades = createMockWritable([]);

vi.mock('svelte/store', () => ({
  get: (store) => store._get(),
  writable: (v) => createMockWritable(v),
}));

vi.mock('./appStore.js', () => ({
  trades: mockTrades,
}));

// ---- Mock supabase module ----
const mockInsertTrade = vi.fn();
const mockUpdateTradeInDB = vi.fn();
const mockDeleteTradeFromDB = vi.fn();
const mockFetchTrades = vi.fn();
const mockMigrateLocalTrades = vi.fn();

vi.mock('$lib/api/supabase.js', () => ({
  insertTrade: (...args) => mockInsertTrade(...args),
  updateTradeInDB: (...args) => mockUpdateTradeInDB(...args),
  deleteTradeFromDB: (...args) => mockDeleteTradeFromDB(...args),
  fetchTrades: (...args) => mockFetchTrades(...args),
  migrateLocalTrades: (...args) => mockMigrateLocalTrades(...args),
}));

const { addTrade, updateTrade, deleteTrade, loadTradesFromSupabase } = await import('./tradeStore.js');

// ============================================================
describe('addTrade', () => {
  beforeEach(() => {
    storage = {};
    mockTrades.set([]);
    vi.clearAllMocks();
  });

  it('adds trade optimistically to store', async () => {
    mockInsertTrade.mockResolvedValue({ id: 999 });
    const trade = { match: 'A vs B', type: 'FHG' };
    const result = await addTrade(trade);

    expect(result).toMatchObject({ match: 'A vs B', type: 'FHG' });
    expect(result.id).toBeDefined();
  });

  it('persists to localStorage', async () => {
    mockInsertTrade.mockResolvedValue({ id: 100 });
    await addTrade({ match: 'X vs Y' });

    const saved = JSON.parse(storage['fhg_trades']);
    expect(saved).toHaveLength(1);
    expect(saved[0].match).toBe('X vs Y');
  });

  it('updates id from Supabase response', async () => {
    mockInsertTrade.mockResolvedValue({ id: 42 });
    await addTrade({ match: 'Test' });

    const current = mockTrades._get();
    expect(current[0].id).toBe(42);
  });

  it('keeps local trade when Supabase fails', async () => {
    mockInsertTrade.mockRejectedValue(new Error('network'));
    const result = await addTrade({ match: 'Offline' });

    expect(result.match).toBe('Offline');
    expect(mockTrades._get()).toHaveLength(1);
  });

  it('does not replace id when Supabase returns null', async () => {
    mockInsertTrade.mockResolvedValue(null);
    const result = await addTrade({ match: 'NoId' });

    // id should remain the temp id (Date.now based)
    expect(typeof result.id).toBe('number');
    expect(result.id).toBeGreaterThan(1000);
  });
});

// ============================================================
describe('updateTrade', () => {
  beforeEach(() => {
    storage = {};
    mockTrades.set([{ id: 1, match: 'A vs B', status: 'pending' }]);
    vi.clearAllMocks();
  });

  it('updates trade in store', () => {
    updateTrade(1, { status: 'validated' });
    const current = mockTrades._get();
    expect(current[0].status).toBe('validated');
  });

  it('persists update to localStorage', () => {
    updateTrade(1, { status: 'lost' });
    const saved = JSON.parse(storage['fhg_trades']);
    expect(saved[0].status).toBe('lost');
  });

  it('does not modify other trades', () => {
    mockTrades.set([
      { id: 1, match: 'A', status: 'pending' },
      { id: 2, match: 'B', status: 'pending' },
    ]);
    updateTrade(1, { status: 'validated' });
    const current = mockTrades._get();
    expect(current[1].status).toBe('pending');
  });
});

// ============================================================
describe('deleteTrade', () => {
  beforeEach(() => {
    storage = {};
    mockTrades.set([
      { id: 1, match: 'A' },
      { id: 2, match: 'B' },
    ]);
    vi.clearAllMocks();
  });

  it('removes trade from store', () => {
    deleteTrade(1);
    const current = mockTrades._get();
    expect(current).toHaveLength(1);
    expect(current[0].id).toBe(2);
  });

  it('persists deletion to localStorage', () => {
    deleteTrade(1);
    const saved = JSON.parse(storage['fhg_trades']);
    expect(saved).toHaveLength(1);
    expect(saved[0].id).toBe(2);
  });

  it('does nothing when id not found', () => {
    deleteTrade(999);
    expect(mockTrades._get()).toHaveLength(2);
  });
});

// ============================================================
describe('loadTradesFromSupabase', () => {
  beforeEach(() => {
    storage = {};
    mockTrades.set([]);
    vi.clearAllMocks();
  });

  it('loads trades from Supabase and sets store', async () => {
    const remoteTrades = [{ id: 10, match: 'Remote' }];
    mockMigrateLocalTrades.mockResolvedValue();
    mockFetchTrades.mockResolvedValue(remoteTrades);

    await loadTradesFromSupabase();

    expect(mockTrades._get()).toEqual(remoteTrades);
    const saved = JSON.parse(storage['fhg_trades']);
    expect(saved).toEqual(remoteTrades);
  });

  it('does not update store when fetchTrades returns null', async () => {
    mockMigrateLocalTrades.mockResolvedValue();
    mockFetchTrades.mockResolvedValue(null);

    mockTrades.set([{ id: 1, match: 'Local' }]);
    await loadTradesFromSupabase();

    expect(mockTrades._get()).toEqual([{ id: 1, match: 'Local' }]);
  });

  it('falls back silently when Supabase throws', async () => {
    mockMigrateLocalTrades.mockRejectedValue(new Error('down'));

    mockTrades.set([{ id: 1, match: 'Fallback' }]);
    await loadTradesFromSupabase();

    // Store should remain unchanged
    expect(mockTrades._get()).toEqual([{ id: 1, match: 'Fallback' }]);
  });
});
