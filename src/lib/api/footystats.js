/* ================================================
   footystats.js — Appels via le proxy Netlify
   FHG Tracker
   ================================================ */

import { cacheGet, cacheSet, cacheKey } from './cache.js';
import { getIsDemo } from '$lib/stores/appStore.js';
import { MOCK_DATA } from '$lib/core/mockData.js';

const PROXY_URL = '/.netlify/functions/footystats';

const TTL = {
  'todays-matches':  10 * 60 * 1000,
  'league-teams':    60 * 60 * 1000,
  'league-matches':  30 * 60 * 1000,
  'country-leagues': 24 * 60 * 60 * 1000,
  'match':           15 * 60 * 1000,
  'league-table':    60 * 60 * 1000,
};

async function apiRequest(endpoint, params = {}) {
  const key = cacheKey(endpoint, params);
  const cached = cacheGet(key);
  if (cached) return cached;

  const url = new URL(PROXY_URL, window.location.origin);
  url.searchParams.set('endpoint', endpoint);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const response = await fetch(url.toString());

  if (response.status === 503) throw new Error('NO_API_KEY');
  if (response.status === 401) throw new Error('INVALID_API_KEY');
  if (response.status === 429) throw new Error('RATE_LIMIT');
  if (!response.ok) throw new Error(`HTTP_${response.status}`);

  const data = await response.json();
  if (data.error) throw new Error(data.error);

  cacheSet(key, data, TTL[endpoint] || TTL['league-teams']);
  return data;
}

export async function testApiConnection() {
  try {
    const url = new URL(PROXY_URL, window.location.origin);
    url.searchParams.set('endpoint', 'country-leagues');
    url.searchParams.set('country_id', '1');

    const res = await fetch(url.toString());

    if (res.status === 503) return {
      success: false,
      error: 'Clé API non configurée — ajoutez FOOTYSTATS_API_KEY dans les variables d\'env Netlify',
    };
    if (res.status === 401) return { success: false, error: 'Clé API invalide (401)' };
    if (!res.ok) return { success: false, error: `Erreur HTTP ${res.status}` };

    const data = await res.json();
    if (data.error) return { success: false, error: data.error };
    return { success: true, message: 'Connexion réussie ✓' };
  } catch (e) {
    return { success: false, error: `Erreur réseau : ${e.message}` };
  }
}

export async function getAllLeagues() {
  const isDemo = getIsDemo();
  if (isDemo) return MOCK_DATA.leagues;
  return await apiRequest('country-leagues');
}

export async function getLeagueTeams(leagueId) {
  const isDemo = getIsDemo();
  if (isDemo) return MOCK_DATA.teams[leagueId] || [];
  const data = await apiRequest('league-teams', { league_id: leagueId });
  return data?.data || [];
}

export async function getTodaysMatches(date) {
  const isDemo = getIsDemo();
  if (isDemo) return MOCK_DATA.matches;
  const d = date || new Date().toISOString().split('T')[0];
  const data = await apiRequest('todays-matches', { date: d });
  return data?.data || [];
}

export async function getLeagueMatches(leagueId) {
  const isDemo = getIsDemo();
  if (isDemo) return MOCK_DATA.leagueMatches[leagueId] || [];
  const data = await apiRequest('league-matches', { league_id: leagueId });
  return data?.data || [];
}

export async function getMatchDetail(matchId) {
  const isDemo = getIsDemo();
  if (isDemo) return MOCK_DATA.matchDetails[matchId] || null;
  const data = await apiRequest('match', { match_id: matchId });
  return data?.data || null;
}

export async function getH2H(homeId, awayId, leagueId) {
  const isDemo = getIsDemo();
  if (isDemo) {
    const key = `${homeId}_${awayId}`;
    return MOCK_DATA.h2h[key] || [];
  }
  const matches = await getLeagueMatches(leagueId);
  return matches.filter(m =>
    (m.homeID === homeId && m.awayID === awayId) ||
    (m.homeID === awayId && m.awayID === homeId)
  ).slice(-5);
}

export async function getLeagueTable(leagueId) {
  const isDemo = getIsDemo();
  if (isDemo) return [];
  const data = await apiRequest('league-table', { league_id: leagueId });
  return data?.data || data?.league_table || [];
}

export async function rawApiCall(endpoint, params = {}) {
  const start = performance.now();
  const url = new URL(PROXY_URL, window.location.origin);
  url.searchParams.set('endpoint', endpoint);
  Object.entries(params).forEach(([k, v]) => {
    if (v != null && v !== '') url.searchParams.set(k, v);
  });

  const response = await fetch(url.toString());
  const elapsed = Math.round(performance.now() - start);
  const data = await response.json();
  return { data, status: response.status, elapsed };
}

export async function enrichMatch(match, leagueId) {
  try {
    const [homeTeamData, awayTeamData, h2h] = await Promise.all([
      getLeagueTeams(leagueId).then(teams => teams.find(t => t.id === match.homeID) || null),
      getLeagueTeams(leagueId).then(teams => teams.find(t => t.id === match.awayID) || null),
      getH2H(match.homeID, match.awayID, leagueId),
    ]);
    return { homeTeamData, awayTeamData, h2h };
  } catch (e) {
    console.warn('enrichMatch error:', e);
    return { homeTeamData: null, awayTeamData: null, h2h: [] };
  }
}
