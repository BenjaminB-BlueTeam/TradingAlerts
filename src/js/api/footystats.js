/**
 * footystats.js — Client API FootyStats
 * Tous les appels à football-data-api.com passent ici
 */

import { withCache, cacheGet, cacheSet } from './cache.js';

const BASE_URL = 'https://api.football-data-api.com';

// Récupère la clé API stockée dans localStorage
function getApiKey() {
  return localStorage.getItem('fhg_api_key') || '';
}

/**
 * Requête HTTP générique avec gestion d'erreur
 */
async function apiFetch(endpoint, params = {}) {
  const key = getApiKey();
  if (!key) {
    throw new Error('Clé API non configurée');
  }

  const url = new URL(`${BASE_URL}${endpoint}`);
  url.searchParams.set('key', key);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  });

  const resp = await fetch(url.toString());
  if (!resp.ok) {
    if (resp.status === 401 || resp.status === 403) {
      throw new Error('Clé API invalide ou accès refusé');
    }
    if (resp.status === 429) {
      throw new Error('Limite de requêtes atteinte — réessayez dans quelques secondes');
    }
    throw new Error(`Erreur API : ${resp.status} ${resp.statusText}`);
  }

  const json = await resp.json();
  if (json.status === false) {
    throw new Error(json.message || 'Erreur API inconnue');
  }
  return json;
}

// =============================================
// ENDPOINTS
// =============================================

/**
 * Tester la connexion API
 * @returns {Promise<boolean>}
 */
export async function testApiConnection() {
  try {
    await apiFetch('/country-leagues');
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Liste toutes les ligues disponibles
 */
export async function fetchCountryLeagues() {
  const cacheKey = 'country_leagues';
  return withCache(cacheKey, async () => {
    const data = await apiFetch('/country-leagues');
    return data.data || [];
  }, 60 * 60 * 1000); // Cache 1h
}

/**
 * Stats des équipes d'une ligue (saison en cours)
 * @param {number|string} leagueId
 */
export async function fetchLeagueTeams(leagueId) {
  const cacheKey = `league_teams_${leagueId}`;
  return withCache(cacheKey, async () => {
    const data = await apiFetch('/league-teams', { league_id: leagueId });
    return data.data || [];
  });
}

/**
 * Stats des équipes d'une ligue (saison N-1)
 * @param {number|string} leagueIdN1
 */
export async function fetchLeagueTeamsN1(leagueIdN1) {
  const cacheKey = `league_teams_n1_${leagueIdN1}`;
  return withCache(cacheKey, async () => {
    const data = await apiFetch('/league-teams', { league_id: leagueIdN1 });
    return data.data || [];
  });
}

/**
 * Matchs du jour ou d'une date précise
 * @param {string} date - format YYYY-MM-DD
 */
export async function fetchTodaysMatches(date) {
  const cacheKey = `matches_${date}`;
  return withCache(cacheKey, async () => {
    const data = await apiFetch('/todays-matches', { date });
    return data.data || [];
  }, 5 * 60 * 1000); // Cache 5min pour les matchs du jour
}

/**
 * Tous les matchs d'une ligue (pour calculer les 5 derniers)
 * @param {number|string} leagueId
 */
export async function fetchLeagueMatches(leagueId) {
  const cacheKey = `league_matches_${leagueId}`;
  return withCache(cacheKey, async () => {
    const data = await apiFetch('/league-matches', { league_id: leagueId });
    return data.data || [];
  });
}

/**
 * Détail d'un match + H2H
 * @param {number|string} matchId
 */
export async function fetchMatchDetail(matchId) {
  const cacheKey = `match_detail_${matchId}`;
  return withCache(cacheKey, async () => {
    const data = await apiFetch('/match', { match_id: matchId });
    return data.data || null;
  }, 5 * 60 * 1000);
}

// =============================================
// HELPERS DE TRAITEMENT DES DONNÉES API
// =============================================

/**
 * Extraire les H2H d'un détail match
 * Retourne les confrontations directes formatées pour calculerScoreFHG
 * @param {Object} matchDetail - résultat de fetchMatchDetail
 * @param {number} homeId
 * @param {number} awayId
 * @param {number} limit - nombre de H2H à garder
 */
export function extractH2H(matchDetail, homeId, awayId, limit = 5) {
  if (!matchDetail || !matchDetail.h2h) return [];

  return matchDetail.h2h
    .slice(0, limit)
    .map(m => {
      const isHome = m.homeID === homeId;
      const teamGoalsHT = isHome ? (m.homeGoals_HT ?? 0) : (m.awayGoals_HT ?? 0);
      return {
        date: m.date_unix
          ? new Date(m.date_unix * 1000).toLocaleDateString('fr-FR')
          : '',
        score: `${m.homeGoals}-${m.awayGoals}`,
        htScore: `${m.homeGoals_HT ?? '?'}-${m.awayGoals_HT ?? '?'}`,
        equipe_ciblee_but_avant_45min: teamGoalsHT > 0,
      };
    });
}

/**
 * Calculer les stats des 5 derniers matchs pour une équipe
 * @param {Array} allMatches - tous les matchs de la ligue
 * @param {number} teamId
 */
export function calcLast5Stats(allMatches, teamId) {
  const teamMatches = allMatches
    .filter(m =>
      (m.homeID === teamId || m.awayID === teamId) &&
      m.status === 'complete'
    )
    .sort((a, b) => (b.date_unix || 0) - (a.date_unix || 0))
    .slice(0, 5);

  let buts3145 = 0;
  teamMatches.forEach(m => {
    const isHome = m.homeID === teamId;
    // Approximation : si données par tranche disponibles
    const goals3145 = isHome
      ? (m.home_goals_min_31_to_45 ?? 0)
      : (m.away_goals_min_31_to_45 ?? 0);
    if (goals3145 > 0) buts3145++;
  });

  return {
    matchesPlayed: teamMatches.length,
    buts3145,
  };
}
