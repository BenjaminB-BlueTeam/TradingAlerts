/* ================================================
   data.js — Chargement et analyse des matchs
   FHG Tracker
   ================================================ */

import { getTodaysMatches, getLeagueTeams, getH2H, testApiConnection } from '$lib/api/footystats.js';
import { analyserMatch } from '$lib/core/scoring.js';
import { filtrerMatchs } from '$lib/core/filters.js';
import {
  signaux, exclus, loading, lastUpdate,
  apiConnected, leagues, config,
} from '$lib/stores/appStore.js';
import { get } from 'svelte/store';

export async function loadData() {
  loading.set(true);

  try {
    const activeLeagues = get(leagues).filter(l => l.active);
    const cfg = get(config);

    const rawMatches = await getTodaysMatches();

    const analysed = await Promise.all(
      rawMatches.map(match => analyseOneMatch(match, activeLeagues, cfg))
    );

    const result = filtrerMatchs(
      analysed.filter(Boolean),
      { seuilMinimum: cfg.seuilFHG || 60 }
    );

    signaux.set(result.signaux);
    exclus.set(result.exclus);
    lastUpdate.set(Date.now());
    loading.set(false);

    return result;
  } catch (err) {
    console.error('loadData error:', err);
    loading.set(false);
    apiConnected.set(false);
    return { signaux: [], exclus: [] };
  }
}

async function analyseOneMatch(match, activeLeagues, cfg) {
  try {
    const league = activeLeagues.find(l =>
      l.id === match.leagueId || l.leagueId === match.leagueId
    );
    if (!league) return null;

    const teams = await getLeagueTeams(league.id || league.leagueId);
    const homeTeam = teams.find(t => t.id === match.homeID) || null;
    const awayTeam = teams.find(t => t.id === match.awayID) || null;

    if (!homeTeam && !awayTeam) return null;

    const h2hHome = homeTeam
      ? await getH2H(match.homeID, match.awayID, league.id).catch(() => [])
      : [];
    const h2hAway = awayTeam
      ? await getH2H(match.awayID, match.homeID, league.id).catch(() => [])
      : [];

    const result = analyserMatch(match, homeTeam, awayTeam, h2hHome, h2hAway, cfg);

    if (result) {
      result.h2h = h2hHome.length > 0 ? h2hHome : h2hAway;
    }

    return result;
  } catch (err) {
    console.warn(`analyseOneMatch error for match ${match.id}:`, err);
    return null;
  }
}

export async function initApp() {
  const status = await testApiConnection();
  apiConnected.set(status.success);
  return status;
}
