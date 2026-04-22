/* ================================================
   tradeStore.js — Trade CRUD operations (Supabase + localStorage)
   FHG Tracker
   ================================================ */

import { get } from 'svelte/store';
import { trades } from './appStore.js';

const STORAGE_KEY_TRADES = 'fhg_trades';

export async function addTrade(trade) {
  const tempId = Date.now();
  const optimistic = { ...trade, id: tempId };

  trades.update(list => {
    const updated = [...list, optimistic];
    localStorage.setItem(STORAGE_KEY_TRADES, JSON.stringify(updated));
    return updated;
  });

  try {
    const { insertTrade } = await import('$lib/api/supabase.js');
    const saved = await insertTrade(trade);
    if (saved?.id) {
      trades.update(list => {
        const updated = list.map(t => t.id === tempId ? { ...t, id: saved.id } : t);
        localStorage.setItem(STORAGE_KEY_TRADES, JSON.stringify(updated));
        return updated;
      });
    }
  } catch (e) {
    console.warn('addTrade: Supabase indisponible, trade conservé en local', e);
  }

  return optimistic;
}

export function updateTrade(id, updates) {
  trades.update(list => {
    const updated = list.map(t => t.id === id ? { ...t, ...updates } : t);
    localStorage.setItem(STORAGE_KEY_TRADES, JSON.stringify(updated));
    return updated;
  });

  import('$lib/api/supabase.js').then(({ updateTradeInDB }) => {
    updateTradeInDB(id, updates);
  });
}

export function deleteTrade(id) {
  trades.update(list => {
    const updated = list.filter(t => t.id !== id);
    localStorage.setItem(STORAGE_KEY_TRADES, JSON.stringify(updated));
    return updated;
  });

  import('$lib/api/supabase.js').then(({ deleteTradeFromDB }) => {
    deleteTradeFromDB(id);
  });
}

export async function loadTradesFromSupabase() {
  try {
    const { fetchTrades, migrateLocalTrades } = await import('$lib/api/supabase.js');
    await migrateLocalTrades(get(trades));
    const fetched = await fetchTrades();
    if (fetched) {
      localStorage.setItem(STORAGE_KEY_TRADES, JSON.stringify(fetched));
      trades.set(fetched);
    }
  } catch (e) {
    console.warn('loadTradesFromSupabase: fallback localStorage', e);
  }
}
