/* ================================================
   appStore.js — Stores Svelte (remplace store.js)
   FHG Tracker
   ================================================ */

import { writable } from 'svelte/store';

const STORAGE_KEYS = {
  CONFIG:        'fhg_config',
  TRADES:        'fhg_trades',
  LEAGUES:       'fhg_leagues',
  PREFERENCES:   'fhg_prefs',
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
  alertsFilter:     'today',
};

// ---- Stores ----
export const apiConnected    = writable(false);
export const leagues         = writable(getDefaultLeagues());
export const config          = writable({ ...defaultConfig });
export const prefs           = writable({ ...defaultPrefs });
export const trades          = writable([]);
export const pauseSession    = writable(false);
export const alertesActives  = writable([]);
export const apiRequestsRemaining = writable(null); // Requêtes API restantes (sur 1800/h)

// ---- Persistance localStorage ----

export function loadFromStorage() {
  try {
    const savedConfig  = JSON.parse(localStorage.getItem(STORAGE_KEYS.CONFIG)      || 'null');
    const savedTrades  = JSON.parse(localStorage.getItem(STORAGE_KEYS.TRADES)      || '[]');
    const savedLeagues = JSON.parse(localStorage.getItem(STORAGE_KEYS.LEAGUES)     || 'null');
    const savedPrefs   = JSON.parse(localStorage.getItem(STORAGE_KEYS.PREFERENCES) || 'null');

    config.set(savedConfig  ? { ...defaultConfig, ...savedConfig }  : { ...defaultConfig });
    trades.set(Array.isArray(savedTrades) ? savedTrades : []);
    leagues.set(savedLeagues || getDefaultLeagues());
    prefs.set(savedPrefs ? { ...defaultPrefs, ...savedPrefs } : { ...defaultPrefs });
    return true;
  } catch (e) {
    console.warn('Store: erreur chargement localStorage', e);
    config.set({ ...defaultConfig });
    trades.set([]);
    leagues.set(getDefaultLeagues());
    prefs.set({ ...defaultPrefs });
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

export function clearAllData() {
  Object.values(STORAGE_KEYS).forEach(k => localStorage.removeItem(k));
  location.reload();
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
