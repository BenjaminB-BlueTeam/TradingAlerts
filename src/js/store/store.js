/**
 * store.js — State management simple (pub/sub + localStorage)
 * Pas de dépendance externe — Vanilla JS ES6+
 */

// =============================================
// STATE INITIAL
// =============================================

const initialState = {
  // API
  apiKey: '',
  apiConnected: false,
  apiError: null,

  // Mode
  demoMode: true,
  sessionPaused: false,

  // Matchs
  matches: [],
  matchesLoading: false,
  lastFetch: null,

  // Ligues actives
  activeLeagues: [],

  // Config alertes
  alertsConfig: {
    seuilFHGN: 75,
    seuilForme5M: 3,
    ignoreDebutSaison: true,
    seuilMatchesSaison: 8,
    ponderationN1: true,

    afficherBadge1MT: true,
    alerterPriorite1MT: false,
    seuil1MT: 50,

    filtreH2HActif: true,
    minMatchesH2HPourExclusion: 3,
    penaliteH2HOrange: -8,

    analyseDCAutomatique: true,
    seuilDC: 55,

    profil: 'intermediaire',
    neAlertePasAvant: 20,
    neAlertePasApres: 70,

    maxAlertesSession: 5,
    stopApresVictoires: false,
    stopApresNVictoires: 3,

    joursActifs: [1, 2, 3, 4, 5, 6, 0], // Lun-Dim
  },

  // Journal trades
  trades: [],

  // Préférences
  prefs: {
    dateRange: 'today',
    filtreSignalMin: 0,
    filtreLigue: 'all',
    filtreContexte: 'all',
    seulement1MT: false,
    afficherExclus: false,
  },
};

// =============================================
// STORE
// =============================================

class Store {
  constructor() {
    this._state = { ...initialState };
    this._listeners = {};
    this._loadFromStorage();
  }

  // --- GETTERS ---

  get(key) {
    return this._state[key];
  }

  getAll() {
    return { ...this._state };
  }

  // --- SETTERS ---

  set(key, value) {
    const prev = this._state[key];
    this._state[key] = value;
    this._emit(key, value, prev);
    this._saveToStorage(key, value);
  }

  update(key, partial) {
    const prev = this._state[key];
    const next = { ...prev, ...partial };
    this._state[key] = next;
    this._emit(key, next, prev);
    this._saveToStorage(key, next);
  }

  // --- SUBSCRIPTIONS ---

  on(key, listener) {
    if (!this._listeners[key]) this._listeners[key] = [];
    this._listeners[key].push(listener);
    return () => this.off(key, listener);
  }

  off(key, listener) {
    if (!this._listeners[key]) return;
    this._listeners[key] = this._listeners[key].filter(l => l !== listener);
  }

  _emit(key, value, prev) {
    if (this._listeners[key]) {
      this._listeners[key].forEach(l => l(value, prev));
    }
    if (this._listeners['*']) {
      this._listeners['*'].forEach(l => l(key, value, prev));
    }
  }

  // --- PERSISTENCE ---

  _saveToStorage(key, value) {
    const persistKeys = [
      'apiKey', 'activeLeagues', 'alertsConfig', 'trades', 'prefs',
    ];
    if (!persistKeys.includes(key)) return;
    try {
      const storageKey = key === 'apiKey' ? 'fhg_api_key' : `fhg_${key}`;
      localStorage.setItem(storageKey, JSON.stringify(value));
    } catch (e) {
      console.warn('[Store] Impossible de persister:', key);
    }
  }

  _loadFromStorage() {
    // Clé API
    const apiKey = localStorage.getItem('fhg_api_key') || '';
    if (apiKey) {
      this._state.apiKey = apiKey;
      this._state.demoMode = false;
    }

    // Ligues actives
    const leagues = this._parseSafe('fhg_activeLeagues');
    if (leagues) this._state.activeLeagues = leagues;

    // Config alertes
    const alertsConfig = this._parseSafe('fhg_alertsConfig');
    if (alertsConfig) {
      this._state.alertsConfig = { ...initialState.alertsConfig, ...alertsConfig };
    }

    // Trades
    const trades = this._parseSafe('fhg_trades');
    if (trades) this._state.trades = trades;

    // Prefs
    const prefs = this._parseSafe('fhg_prefs');
    if (prefs) this._state.prefs = { ...initialState.prefs, ...prefs };
  }

  _parseSafe(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  // --- HELPERS TRADES ---

  addTrade(trade) {
    const trades = [...this._state.trades, { ...trade, id: Date.now() }];
    this.set('trades', trades);
  }

  updateTrade(id, updates) {
    const trades = this._state.trades.map(t =>
      t.id === id ? { ...t, ...updates } : t
    );
    this.set('trades', trades);
  }

  deleteTrade(id) {
    const trades = this._state.trades.filter(t => t.id !== id);
    this.set('trades', trades);
  }

  // --- STATS TRADES ---

  getTradeStats() {
    const trades = this._state.trades.filter(t => t.resultat !== 'non-joue');
    if (!trades.length) return null;

    const total = trades.length;
    const gagnes = trades.filter(t => t.resultat === 'gagne').length;
    const tauxReussite = total > 0 ? Math.round((gagnes / total) * 100) : 0;

    // Stats par badge 1MT
    const avec1MT = trades.filter(t => t.badge1MT50);
    const sans1MT = trades.filter(t => !t.badge1MT50);
    const tauxAvec1MT = avec1MT.length
      ? Math.round((avec1MT.filter(t => t.resultat === 'gagne').length / avec1MT.length) * 100)
      : null;
    const tauxSans1MT = sans1MT.length
      ? Math.round((sans1MT.filter(t => t.resultat === 'gagne').length / sans1MT.length) * 100)
      : null;

    // Stats par H2H
    const h2hVert = trades.filter(t => t.h2h === 'favorable');
    const h2hOrange = trades.filter(t => t.h2h === 'defavorable');
    const tauxH2HVert = h2hVert.length
      ? Math.round((h2hVert.filter(t => t.resultat === 'gagne').length / h2hVert.length) * 100)
      : null;
    const tauxH2HOrange = h2hOrange.length
      ? Math.round((h2hOrange.filter(t => t.resultat === 'gagne').length / h2hOrange.length) * 100)
      : null;

    // Cote moyenne
    const cotesValides = trades.filter(t => t.coteObjectif > 0).map(t => t.coteObjectif);
    const coteMoyenne = cotesValides.length
      ? (cotesValides.reduce((a, b) => a + b, 0) / cotesValides.length).toFixed(2)
      : null;

    // Meilleures/pires séries
    let meillereSerie = 0, piresSerie = 0;
    let currentWin = 0, currentLoss = 0;
    trades.forEach(t => {
      if (t.resultat === 'gagne') {
        currentWin++;
        currentLoss = 0;
        meillereSerie = Math.max(meillereSerie, currentWin);
      } else {
        currentLoss++;
        currentWin = 0;
        piresSerie = Math.max(piresSerie, currentLoss);
      }
    });

    return {
      total,
      gagnes,
      tauxReussite,
      tauxAvec1MT,
      tauxSans1MT,
      tauxH2HVert,
      tauxH2HOrange,
      coteMoyenne,
      meillereSerie,
      piresSerie,
    };
  }
}

// Singleton
export const store = new Store();
export default store;
