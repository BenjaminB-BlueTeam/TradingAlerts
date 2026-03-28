/* ================================================
   store.js — Gestion d'état centralisée (simple)
   FHG Tracker
   ================================================ */

/**
 * Store centralisé pour l'état de l'application.
 * Utilise un pattern pub/sub simple.
 * Persistance via localStorage pour les données critiques.
 */

const STORAGE_KEYS = {
  API_KEY:        'fhg_api_key',
  CONFIG:         'fhg_config',
  TRADES:         'fhg_trades',
  LEAGUES:        'fhg_leagues',
  PREFERENCES:    'fhg_prefs',
  PAUSE_SESSION:  'fhg_pause',
};

// ---- État par défaut ----
const defaultConfig = {
  // FHG
  seuilFHG:         75,   // %
  seuil5Matchs:     3,    // sur 5
  ignoreDebutSaison:true,
  seuilMatchsMin:   8,
  ponderationN1:    true,

  // Bonus 1MT
  afficher1MT:      true,
  alerter1MT:       false,
  seuil1MT:         50,   // %

  // H2H
  filtreH2HActif:   true,
  minH2H:           3,
  penaliteH2H:      8,    // pts

  // DC
  analyseDC:        true,
  seuilRetourDC:    55,   // %

  // Timing
  profil:           'intermediaire', // debutant | intermediaire | expert
  minuteMin:        20,
  minuteMax:        70,

  // Session
  maxAlertes:       5,
  stopVictoires:    false,
  nbVictoires:      3,

  // Jours actifs
  joursActifs:      [1,2,3,4,5,6,0], // Lun-Dim
};

const defaultPrefs = {
  currentPage:      'dashboard',
  focusMode:        false,
  demoBannerClosed: false,
  alertsFilter:     'today',
};

// ---- État global ----
let state = {
  // API
  apiKey:           null,
  apiConnected:     false,
  isDemo:           true,

  // Données
  matches:          [],       // matchs du jour
  matchesUpcoming:  [],       // matchs à venir
  leagues:          [],       // ligues configurées
  allLeagues:       [],       // toutes ligues dispo

  // Signaux calculés
  signaux:          [],       // matchs non exclus triés
  exclus:           [],       // matchs exclus H2H

  // Config et prefs
  config:           { ...defaultConfig },
  prefs:            { ...defaultPrefs },

  // Trades
  trades:           [],

  // Session
  pauseSession:     false,
  alertesCount:     0,
  alertesActives:   [],

  // UI
  loading:          false,
  lastUpdate:       null,
};

// ---- Abonnés (pub/sub) ----
const subscribers = {};

/**
 * Souscrire à un événement de changement d'état
 */
export function subscribe(event, callback) {
  if (!subscribers[event]) subscribers[event] = [];
  subscribers[event].push(callback);
  return () => {
    subscribers[event] = subscribers[event].filter(cb => cb !== callback);
  };
}

/**
 * Émettre un événement
 */
function emit(event, data) {
  if (subscribers[event]) {
    subscribers[event].forEach(cb => cb(data));
  }
  // '*' = toute modification
  if (event !== '*' && subscribers['*']) {
    subscribers['*'].forEach(cb => cb({ event, data }));
  }
}

/**
 * Lire l'état complet ou une clé
 */
export function getState(key) {
  if (key) return state[key];
  return { ...state };
}

/**
 * Mettre à jour l'état et notifier les abonnés
 */
export function setState(updates, silent = false) {
  const prev = { ...state };
  state = { ...state, ...updates };
  if (!silent) {
    Object.keys(updates).forEach(key => {
      emit(key, state[key]);
    });
  }
  return state;
}

// ---- Persistance localStorage ----

/**
 * Charger toutes les données persistées
 */
export function loadFromStorage() {
  try {
    const config  = JSON.parse(localStorage.getItem(STORAGE_KEYS.CONFIG)      || 'null');
    const trades  = JSON.parse(localStorage.getItem(STORAGE_KEYS.TRADES)      || '[]');
    const leagues = JSON.parse(localStorage.getItem(STORAGE_KEYS.LEAGUES)     || 'null');
    const prefs   = JSON.parse(localStorage.getItem(STORAGE_KEYS.PREFERENCES) || 'null');

    setState({
      isDemo:  true, // Sera mis à jour après vérification API dans app.js
      config:  config  ? { ...defaultConfig, ...config }  : { ...defaultConfig },
      trades:  Array.isArray(trades) ? trades : [],
      leagues: leagues || getDefaultLeagues(),
      prefs:   prefs   ? { ...defaultPrefs,  ...prefs }   : { ...defaultPrefs },
    }, true);

    return true;
  } catch (e) {
    console.warn('Store: erreur chargement localStorage', e);
    setState({
      isDemo:  true,
      config:  { ...defaultConfig },
      trades:  [],
      leagues: getDefaultLeagues(),
      prefs:   { ...defaultPrefs },
    }, true);
    return false;
  }
}

export function saveApiKey(key) {
  localStorage.setItem(STORAGE_KEYS.API_KEY, key || '');
  setState({ apiKey: key, isDemo: !key });
}

export function saveConfig(config) {
  const merged = { ...state.config, ...config };
  localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(merged));
  setState({ config: merged });
}

export function saveLeagues(leagues) {
  localStorage.setItem(STORAGE_KEYS.LEAGUES, JSON.stringify(leagues));
  setState({ leagues });
}

export function savePrefs(prefs) {
  const merged = { ...state.prefs, ...prefs };
  localStorage.setItem(STORAGE_KEYS.PREFERENCES, JSON.stringify(merged));
  setState({ prefs: merged });
}

export function addTrade(trade) {
  const trades = [...state.trades, { ...trade, id: Date.now() }];
  localStorage.setItem(STORAGE_KEYS.TRADES, JSON.stringify(trades));
  setState({ trades });
  return trade;
}

export function updateTrade(id, updates) {
  const trades = state.trades.map(t =>
    t.id === id ? { ...t, ...updates } : t
  );
  localStorage.setItem(STORAGE_KEYS.TRADES, JSON.stringify(trades));
  setState({ trades });
}

export function deleteTrade(id) {
  const trades = state.trades.filter(t => t.id !== id);
  localStorage.setItem(STORAGE_KEYS.TRADES, JSON.stringify(trades));
  setState({ trades });
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

// ---- Statistiques trades ----
export function calcStatsTradesGlobal() {
  const trades = state.trades.filter(t => t.resultat !== 'non_joue');
  if (trades.length === 0) return null;

  const gagnes = trades.filter(t => t.resultat === 'gagne').length;
  const total = trades.length;
  const tauxGlobal = Math.round((gagnes / total) * 100);

  // Stats avec/sans badge 1MT
  const avec1MT = trades.filter(t => t.badge1MT);
  const sans1MT  = trades.filter(t => !t.badge1MT);
  const taux1MT  = avec1MT.length > 0
    ? Math.round((avec1MT.filter(t => t.resultat === 'gagne').length / avec1MT.length) * 100)
    : null;
  const tauxSans1MT = sans1MT.length > 0
    ? Math.round((sans1MT.filter(t => t.resultat === 'gagne').length / sans1MT.length) * 100)
    : null;

  // Stats H2H
  const h2hVert   = trades.filter(t => t.h2h === 'favorable');
  const h2hOrange = trades.filter(t => t.h2h === 'defavorable');
  const h2hGris   = trades.filter(t => t.h2h === 'insuffisant');
  const tauxH2HVert   = h2hVert.length > 0
    ? Math.round((h2hVert.filter(t => t.resultat === 'gagne').length / h2hVert.length) * 100)
    : null;
  const tauxH2HOrange = h2hOrange.length > 0
    ? Math.round((h2hOrange.filter(t => t.resultat === 'gagne').length / h2hOrange.length) * 100)
    : null;
  const tauxH2HGris   = h2hGris.length > 0
    ? Math.round((h2hGris.filter(t => t.resultat === 'gagne').length / h2hGris.length) * 100)
    : null;

  // Cote moyenne
  const coteMoy = trades.filter(t => t.cote).length > 0
    ? (trades.reduce((s, t) => s + (parseFloat(t.cote) || 0), 0) / trades.filter(t => t.cote).length).toFixed(2)
    : null;

  // ROI estimé (simplifié)
  const roi = coteMoy
    ? Math.round((tauxGlobal / 100 * parseFloat(coteMoy) - 1) * 100)
    : null;

  // Séries
  let maxWin = 0, maxLoss = 0, curWin = 0, curLoss = 0;
  trades.forEach(t => {
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
