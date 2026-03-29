/* ================================================
   footystats.js — Appels via le proxy Netlify
   FHG Tracker
   ================================================ */

import { cacheGet, cacheSet, cacheKey } from './cache.js';
import { apiRequestsRemaining } from '$lib/stores/appStore.js';

const PROXY_URL = '/.netlify/functions/footystats';

const TTL = {
  'todays-matches':  10 * 60 * 1000,
  'league-teams':    60 * 60 * 1000,
  'league-matches':  30 * 60 * 1000,
  'league-list':     24 * 60 * 60 * 1000,
  'match':           15 * 60 * 1000,
  'league-tables':   60 * 60 * 1000,
  'league-season':   60 * 60 * 1000,
};

async function apiRequest(endpoint, params = {}, bypassCache = false) {
  const key = cacheKey(endpoint, params);
  if (!bypassCache) {
    const cached = cacheGet(key);
    if (cached) return cached;
  }

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

  // Capturer le compteur de requêtes restantes
  if (data?.metadata?.request_remaining != null) {
    apiRequestsRemaining.set(Number(data.metadata.request_remaining));
  }

  cacheSet(key, data, TTL[endpoint] || TTL['league-teams']);
  return data;
}

export async function testApiConnection() {
  try {
    const url = new URL(PROXY_URL, window.location.origin);
    url.searchParams.set('endpoint', 'league-list');
    url.searchParams.set('chosen_leagues_only', 'true');

    const res = await fetch(url.toString());

    if (res.status === 503) return {
      success: false,
      error: 'Clé API non configurée — ajoutez FOOTYSTATS_API_KEY dans les variables d\'env Netlify',
    };
    if (res.status === 401) return { success: false, error: 'Clé API invalide (401)' };
    if (!res.ok) return { success: false, error: `Erreur HTTP ${res.status}` };

    const data = await res.json();
    if (data.error) return { success: false, error: data.error };
    return { success: true, message: 'Connexion réussie' };
  } catch (e) {
    return { success: false, error: `Erreur réseau : ${e.message}` };
  }
}

export function normalizeLeagues(raw) {
  const data = raw?.data || raw || [];
  if (!Array.isArray(data)) return [];
  return data.map(l => {
    const seasons = l.season || [];
    const latest = seasons.reduce((a, b) => (b.year > a.year ? b : a), seasons[0] || {});
    return {
      id: latest.id,
      name: l.name || 'Unknown',
      country: l.country || latest.country || '',
      image: l.image || '',
      year: latest.year,
      seasons: seasons.map(s => ({ id: s.id, year: s.year })),
    };
  }).filter(l => l.id);
}

export async function getAllLeagues() {
  const raw = await apiRequest('league-list', { chosen_leagues_only: 'true' });
  return normalizeLeagues(raw);
}

export async function getLeagueTeams(leagueId) {
  const data = await apiRequest('league-teams', { season_id: leagueId, include: 'stats' });
  return data?.data || [];
}

export async function getTodaysMatches(date, bypassCache = false) {
  const d = date || new Date().toISOString().split('T')[0];
  const data = await apiRequest('todays-matches', { date: d }, bypassCache);
  return data?.data || [];
}

export async function getLeagueMatches(leagueId) {
  const data = await apiRequest('league-matches', { season_id: leagueId });
  return data?.data || [];
}

export async function getMatchDetail(matchId, bypassCache = false) {
  const data = await apiRequest('match', { match_id: matchId }, bypassCache);
  return data?.data || null;
}

export async function getH2H(homeId, awayId, leagueId) {
  const matches = await getLeagueMatches(leagueId);
  return matches.filter(m =>
    (m.homeID === homeId && m.awayID === awayId) ||
    (m.homeID === awayId && m.awayID === homeId)
  ).slice(-5);
}

export async function getLeagueSeason(seasonId) {
  const raw = await apiRequest('league-season', { season_id: seasonId });
  const d = raw?.data || (Array.isArray(raw) ? raw[0] : raw);
  if (!d || typeof d !== 'object') return null;
  return {
    matchesPlayed: d.matchesCompleted || 0,
    totalMatches: d.totalMatches || 0,
    avgGoals: d.seasonAVG_overall || 0,
    btts: d.seasonBTTSPercentage || 0,
    cs: d.seasonCSPercentage || 0,
    over05FHG: d.over05_fhg_percentage || 0,
    over15FHG: d.over15_fhg_percentage || 0,
    over25: d.seasonOver25Percentage_overall || 0,
    over05: d.seasonOver05Percentage_overall || 0,
    over05_2HG: d.over05_2hg_percentage || 0,
  };
}

export async function getLeagueTable(leagueId) {
  const data = await apiRequest('league-tables', { season_id: leagueId });
  return data?.data?.league_table || [];
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
