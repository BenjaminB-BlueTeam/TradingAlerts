/* ================================================
   appStore.js — Stores Svelte (remplace store.js)
   FHG Tracker
   ================================================ */

import { writable, get } from 'svelte/store';

const STORAGE_KEYS = {
  CONFIG:        'fhg_config',
  TRADES:        'fhg_trades',
  LEAGUES:       'fhg_leagues',
  PREFERENCES:   'fhg_prefs',
  PAUSE_SESSION: 'fhg_pause',
  WATCHLIST:     'fhg_watchlist',
};

// ---- Valeurs par défaut ----
export const defaultConfig = {
  seuilFHG:         75,
  seuil5Matchs:     3,
  ignoreDebutSaison:true,
  seuilMatchsMin:   8,
  ponderationN1:    true,
  afficher1MT:      true,
  alerter1MT:       false,
  seuil1MT:         50,
  filtreH2HActif:   true,
  minH2H:           3,
  penaliteH2H:      8,
  analyseDC:        true,
  seuilRetourDC:    55,
  profil:           'intermediaire',
  minuteMin:        20,
  minuteMax:        70,
  maxAlertes:       5,
  stopVictoires:    false,
  nbVictoires:      3,
  joursActifs:      [1,2,3,4,5,6,0],
};

export const defaultPrefs = {
  currentPage:      'dashboard',
  focusMode:        false,
  demoBannerClosed: false,
  alertsFilter:     'today',
};

// ---- Stores ----
export const apiConnected    = writable(false);
export const isDemo          = writable(true);
export const matches         = writable([]);
export const matchesUpcoming = writable([]);
export const leagues         = writable(getDefaultLeagues());
export const allLeagues      = writable([]);
export const signaux         = writable([]);
export const exclus          = writable([]);
export const config          = writable({ ...defaultConfig });
export const prefs           = writable({ ...defaultPrefs });
export const trades          = writable([]);
export const loading         = writable(false);
export const lastUpdate      = writable(null);
export const pauseSession    = writable(false);
export const alertesActives  = writable([]);
export const watchlist       = writable([]);  // Matchs pris (cochés dans l'historique)

// Helper pour footystats.js (lit isDemo de façon synchrone)
export function getIsDemo() {
  return get(isDemo);
}

// ---- Persistance localStorage ----

export function loadFromStorage() {
  try {
    const savedConfig  = JSON.parse(localStorage.getItem(STORAGE_KEYS.CONFIG)      || 'null');
    const savedTrades  = JSON.parse(localStorage.getItem(STORAGE_KEYS.TRADES)      || '[]');
    const savedLeagues = JSON.parse(localStorage.getItem(STORAGE_KEYS.LEAGUES)     || 'null');
    const savedPrefs   = JSON.parse(localStorage.getItem(STORAGE_KEYS.PREFERENCES) || 'null');
    const savedWatch   = JSON.parse(localStorage.getItem(STORAGE_KEYS.WATCHLIST)   || '[]');

    config.set(savedConfig  ? { ...defaultConfig, ...savedConfig }  : { ...defaultConfig });
    trades.set(Array.isArray(savedTrades) ? savedTrades : []);
    leagues.set(savedLeagues || getDefaultLeagues());
    prefs.set(savedPrefs ? { ...defaultPrefs, ...savedPrefs } : { ...defaultPrefs });
    watchlist.set(Array.isArray(savedWatch) ? savedWatch : []);
    isDemo.set(true); // Sera mis à jour après testApiConnection dans +layout.svelte

    return true;
  } catch (e) {
    console.warn('Store: erreur chargement localStorage', e);
    config.set({ ...defaultConfig });
    trades.set([]);
    leagues.set(getDefaultLeagues());
    prefs.set({ ...defaultPrefs });
    isDemo.set(true);
    return false;
  }
}

export function saveConfig(newConfig) {
  config.update(c => {
    const merged = { ...c, ...newConfig };
    localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(merged));
    return merged;
  });
}

export function saveLeagues(newLeagues) {
  localStorage.setItem(STORAGE_KEYS.LEAGUES, JSON.stringify(newLeagues));
  leagues.set(newLeagues);
}

export function savePrefs(newPrefs) {
  prefs.update(p => {
    const merged = { ...p, ...newPrefs };
    localStorage.setItem(STORAGE_KEYS.PREFERENCES, JSON.stringify(merged));
    return merged;
  });
}

export async function addTrade(trade) {
  const tempId = Date.now();
  const optimistic = { ...trade, id: tempId };

  trades.update(list => {
    const updated = [...list, optimistic];
    localStorage.setItem(STORAGE_KEYS.TRADES, JSON.stringify(updated));
    return updated;
  });

  try {
    const { insertTrade } = await import('$lib/api/supabase.js');
    const saved = await insertTrade(trade);
    if (saved?.id) {
      trades.update(list => {
        const updated = list.map(t => t.id === tempId ? { ...t, id: saved.id } : t);
        localStorage.setItem(STORAGE_KEYS.TRADES, JSON.stringify(updated));
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
    localStorage.setItem(STORAGE_KEYS.TRADES, JSON.stringify(updated));
    return updated;
  });

  import('$lib/api/supabase.js').then(({ updateTradeInDB }) => {
    updateTradeInDB(id, updates);
  });
}

export function deleteTrade(id) {
  trades.update(list => {
    const updated = list.filter(t => t.id !== id);
    localStorage.setItem(STORAGE_KEYS.TRADES, JSON.stringify(updated));
    return updated;
  });

  import('$lib/api/supabase.js').then(({ deleteTradeFromDB }) => {
    deleteTradeFromDB(id);
  });
}

// ---- Watchlist (matchs alertes pour le Live) ----

export function saveWatchlist(items) {
  localStorage.setItem(STORAGE_KEYS.WATCHLIST, JSON.stringify(items));
  watchlist.set(items);
}

export function addToWatchlist(match) {
  watchlist.update(list => {
    if (list.find(m => m.id === match.id)) return list;
    const updated = [...list, match];
    localStorage.setItem(STORAGE_KEYS.WATCHLIST, JSON.stringify(updated));
    return updated;
  });
}

export function removeFromWatchlist(matchId) {
  watchlist.update(list => {
    const updated = list.filter(m => m.id !== matchId);
    localStorage.setItem(STORAGE_KEYS.WATCHLIST, JSON.stringify(updated));
    return updated;
  });
}

export function clearAllData() {
  Object.values(STORAGE_KEYS).forEach(k => localStorage.removeItem(k));
  location.reload();
}

export async function loadTradesFromSupabase() {
  try {
    const { fetchTrades, migrateLocalTrades } = await import('$lib/api/supabase.js');
    await migrateLocalTrades(get(trades));
    const fetched = await fetchTrades();
    if (fetched) {
      localStorage.setItem(STORAGE_KEYS.TRADES, JSON.stringify(fetched));
      trades.set(fetched);
    }
  } catch (e) {
    console.warn('loadTradesFromSupabase: fallback localStorage', e);
  }
}

export function calcStatsTradesGlobal() {
  const list = get(trades).filter(t => t.resultat !== 'non_joue');
  if (list.length === 0) return null;

  const gagnes = list.filter(t => t.resultat === 'gagne').length;
  const total  = list.length;
  const tauxGlobal = Math.round((gagnes / total) * 100);

  const avec1MT = list.filter(t => t.badge1MT);
  const sans1MT = list.filter(t => !t.badge1MT);
  const taux1MT = avec1MT.length > 0
    ? Math.round((avec1MT.filter(t => t.resultat === 'gagne').length / avec1MT.length) * 100)
    : null;
  const tauxSans1MT = sans1MT.length > 0
    ? Math.round((sans1MT.filter(t => t.resultat === 'gagne').length / sans1MT.length) * 100)
    : null;

  const h2hVert   = list.filter(t => t.h2h === 'favorable');
  const h2hOrange = list.filter(t => t.h2h === 'defavorable');
  const h2hGris   = list.filter(t => t.h2h === 'insuffisant');
  const tauxH2HVert   = h2hVert.length   > 0 ? Math.round((h2hVert.filter(t => t.resultat === 'gagne').length   / h2hVert.length)   * 100) : null;
  const tauxH2HOrange = h2hOrange.length > 0 ? Math.round((h2hOrange.filter(t => t.resultat === 'gagne').length / h2hOrange.length) * 100) : null;
  const tauxH2HGris   = h2hGris.length   > 0 ? Math.round((h2hGris.filter(t => t.resultat === 'gagne').length   / h2hGris.length)   * 100) : null;

  const coteMoy = list.filter(t => t.cote).length > 0
    ? (list.reduce((s, t) => s + (parseFloat(t.cote) || 0), 0) / list.filter(t => t.cote).length).toFixed(2)
    : null;
  const roi = coteMoy
    ? Math.round((tauxGlobal / 100 * parseFloat(coteMoy) - 1) * 100)
    : null;

  let maxWin = 0, maxLoss = 0, curWin = 0, curLoss = 0;
  list.forEach(t => {
    if (t.resultat === 'gagne') {
      curWin++; curLoss = 0;
      if (curWin > maxWin) maxWin = curWin;
    } else {
      curLoss++; curWin = 0;
      if (curLoss > maxLoss) maxLoss = curLoss;
    }
  });

  return {
    total, gagnes, tauxGlobal,
    taux1MT, tauxSans1MT,
    tauxH2HVert, tauxH2HOrange, tauxH2HGris,
    coteMoy, roi,
    maxWin, maxLoss,
    sufficientData: total >= 20,
  };
}

// ---- Ligues par défaut ----
function getDefaultLeagues() {
  return [
    { id: 'bundesliga',    name: 'Bundesliga',         country: 'Allemagne', flag: '🇩🇪', active: true,  leagueId: 82  },
    { id: 'premier-league',name: 'Premier League',      country: 'Angleterre',flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', active: true,  leagueId: 8   },
    { id: 'ligue-1',       name: 'Ligue 1',             country: 'France',    flag: '🇫🇷', active: true,  leagueId: 168 },
    { id: 'eredivisie',    name: 'Eredivisie',          country: 'Pays-Bas',  flag: '🇳🇱', active: true,  leagueId: 302 },
    { id: 'championship',  name: 'Championship',        country: 'Angleterre',flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', active: true,  leagueId: 9   },
    { id: 'super-lig',     name: 'Süper Lig',           country: 'Turquie',   flag: '🇹🇷', active: true,  leagueId: 203 },
    { id: 'la-liga',       name: 'La Liga',             country: 'Espagne',   flag: '🇪🇸', active: false, leagueId: 87  },
    { id: 'serie-a',       name: 'Serie A',             country: 'Italie',    flag: '🇮🇹', active: false, leagueId: 384 },
  ];
}
