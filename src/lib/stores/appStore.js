/* ================================================
   appStore.js — Stores Svelte (remplace store.js)
   Late Goal Tracker
   ================================================ */

import { writable } from 'svelte/store';

const STORAGE_KEYS = {
  CONFIG:        'lg1_config',
  TRADES:        'lg1_trades',
  LEAGUES:       'lg1_leagues',
  PREFERENCES:   'lg1_prefs',
};

// ---- Valeurs par défaut ----
export const defaultConfig = {
  seuilLG1:         75,
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

// One-shot migration : ancien rebrand FHG → LG1 (2026-05-08).
// Recopie les anciennes clés `fhg_*` vers `lg1_*` puis supprime l'origine.
function migrateLegacyKeysOnce() {
  const map = [
    ['fhg_config',  'lg1_config'],
    ['fhg_trades',  'lg1_trades'],
    ['fhg_leagues', 'lg1_leagues'],
    ['fhg_prefs',   'lg1_prefs'],
  ];
  for (const [oldKey, newKey] of map) {
    const oldVal = localStorage.getItem(oldKey);
    if (oldVal !== null && localStorage.getItem(newKey) === null) {
      localStorage.setItem(newKey, oldVal);
    }
    if (oldVal !== null) localStorage.removeItem(oldKey);
  }
}

export function loadFromStorage() {
  try {
    migrateLegacyKeysOnce();
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
