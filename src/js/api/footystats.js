/* ================================================
   footystats.js — Appels API FootyStats
   FHG Tracker
   ================================================ */

import { cacheGet, cacheSet, cacheKey } from './cache.js';
import { getState } from '../store/store.js';
import { MOCK_DATA } from '../core/mockData.js';

const BASE_URL = 'https://api.football-data-api.com';

// TTL personnalisés par endpoint
const TTL = {
  'todays-matches':  10 * 60 * 1000,  // 10 min
  'league-teams':    60 * 60 * 1000,  // 1h
  'league-matches':  30 * 60 * 1000,  // 30 min
  'country-leagues': 24 * 60 * 60 * 1000, // 24h
  'match':           15 * 60 * 1000,  // 15 min
};

/**
 * Requête générique FootyStats avec cache.
 */
async function apiRequest(endpoint, params = {}) {
  const { apiKey } = getState();
  if (!apiKey) throw new Error('NO_API_KEY');

  const key = cacheKey(endpoint, params);
  const cached = cacheGet(key);
  if (cached) return cached;

  const url = new URL(`${BASE_URL}/${endpoint}`);
  url.searchParams.set('key', apiKey);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const response = await fetch(url.toString());
  if (!response.ok) {
    if (response.status === 401) throw new Error('INVALID_API_KEY');
    if (response.status === 429) throw new Error('RATE_LIMIT');
    throw new Error(`HTTP_${response.status}`);
  }

  const data = await response.json();
  if (data.error) throw new Error(data.error);

  cacheSet(key, data, TTL[endpoint] || TTL['league-teams']);
  return data;
}

// ============================================================
// ENDPOINTS
// ============================================================

/**
 * Tester la connexion API (liste des ligues)
 */
export async function testApiConnection(key) {
  if (!key) return { success: false, error: 'Clé API manquante' };
  try {
    const url = `${BASE_URL}/country-leagues?key=${encodeURIComponent(key)}&country_id=1`;
    const res = await fetch(url);
    if (!res.ok) {
      if (res.status === 401) return { success: false, error: 'Clé API invalide (401)' };
      return { success: false, error: `Erreur HTTP ${res.status}` };
    }
    const data = await res.json();
    if (data.error) return { success: false, error: data.error };
    return { success: true, message: 'Connexion réussie ✓' };
  } catch (e) {
    return { success: false, error: `Erreur réseau : ${e.message}` };
  }
}

/**
 * Lister toutes les ligues disponibles
 */
export async function getAllLeagues() {
  const { isDemo } = getState();
  if (isDemo) return MOCK_DATA.leagues;
  return await apiRequest('country-leagues');
}

/**
 * Récupérer les équipes d'une ligue (saison N)
 */
export async function getLeagueTeams(leagueId) {
  const { isDemo } = getState();
  if (isDemo) return MOCK_DATA.teams[leagueId] || [];
  const data = await apiRequest('league-teams', { league_id: leagueId });
  return data?.data || [];
}

/**
 * Récupérer les matchs du jour
 */
export async function getTodaysMatches(date) {
  const { isDemo } = getState();
  if (isDemo) return MOCK_DATA.matches;
  const d = date || new Date().toISOString().split('T')[0];
  const data = await apiRequest('todays-matches', { date: d });
  return data?.data || [];
}

/**
 * Récupérer les matchs d'une ligue (pour calcul 5 derniers)
 */
export async function getLeagueMatches(leagueId) {
  const { isDemo } = getState();
  if (isDemo) return MOCK_DATA.leagueMatches[leagueId] || [];
  const data = await apiRequest('league-matches', { league_id: leagueId });
  return data?.data || [];
}

/**
 * Récupérer le détail d'un match (avec H2H)
 */
export async function getMatchDetail(matchId) {
  const { isDemo } = getState();
  if (isDemo) {
    return MOCK_DATA.matchDetails[matchId] || null;
  }
  const data = await apiRequest('match', { match_id: matchId });
  return data?.data || null;
}

/**
 * Récupérer les H2H pour une paire d'équipes.
 * FootyStats n'a pas d'endpoint H2H direct : on filtre depuis league-matches.
 * On enrichit avec les données match individuelles si besoin.
 */
export async function getH2H(homeId, awayId, leagueId) {
  const { isDemo } = getState();
  if (isDemo) {
    const key = `${homeId}_${awayId}`;
    return MOCK_DATA.h2h[key] || [];
  }

  // Récupérer les matchs de la ligue et filtrer les H2H
  const matches = await getLeagueMatches(leagueId);
  const h2h = matches.filter(m =>
    (m.homeID === homeId && m.awayID === awayId) ||
    (m.homeID === awayId && m.awayID === homeId)
  ).slice(-5); // 5 derniers

  return h2h;
}

/**
 * Charger toutes les données nécessaires pour un match
 * (équipes + H2H)
 */
export async function enrichMatch(match, leagueId) {
  try {
    const [homeTeamData, awayTeamData, h2h] = await Promise.all([
      getLeagueTeams(leagueId).then(teams =>
        teams.find(t => t.id === match.homeID) || null
      ),
      getLeagueTeams(leagueId).then(teams =>
        teams.find(t => t.id === match.awayID) || null
      ),
      getH2H(match.homeID, match.awayID, leagueId),
    ]);
    return { homeTeamData, awayTeamData, h2h };
  } catch (e) {
    console.warn('enrichMatch error:', e);
    return { homeTeamData: null, awayTeamData: null, h2h: [] };
  }
}
