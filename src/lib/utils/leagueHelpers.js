import { getAllLeagues, getLeagueTable, getLeagueSeason, rawApiCall, normalizeLeagues } from '$lib/api/footystats.js';

/**
 * Color helper for league stat values.
 * Returns a CSS color variable based on thresholds.
 */
export function statColor(val, green, orange) {
  if (val >= green) return 'var(--color-accent-green)';
  if (val >= orange) return 'var(--color-signal-moyen)';
  return 'var(--color-text-muted)';
}

/**
 * Fetch leagues from API (chosen leagues).
 * Returns { leagues, loaded } where leagues is the normalized array.
 */
export async function fetchLeagues() {
  try {
    const res = await rawApiCall('league-list', { chosen_leagues_only: 'true' });
    if (res.status === 200) {
      return { leagues: normalizeLeagues(res.data), loaded: true };
    }
  } catch (e) {
    console.warn('loadLeaguesFromAPI: erreur chargement league-list', e);
    // fallback below
  }
  const leagues = await getAllLeagues();
  return { leagues, loaded: false };
}

/**
 * Load stats for all leagues in batches of 3 with 500ms delay.
 * Calls onUpdate(seasonId, stats) for each loaded stat.
 */
export async function loadAllStats(leagues, leagueStats, onUpdate) {
  for (let i = 0; i < leagues.length; i += 3) {
    const batch = leagues.slice(i, i + 3);
    await Promise.all(batch.map(l => loadLeagueStats(l.id, leagueStats, onUpdate)));
    if (i + 3 < leagues.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }
}

/**
 * Load stats for a single league season.
 * Calls onUpdate(seasonId, stats) when loaded, or onUpdate(seasonId, null) on error.
 */
export async function loadLeagueStats(seasonId, leagueStats, onUpdate) {
  if (leagueStats[seasonId]) return;
  onUpdate(seasonId, undefined); // signal loading start
  try {
    const stats = await getLeagueSeason(seasonId);
    if (stats) {
      onUpdate(seasonId, stats);
    }
  } catch (e) {
    console.warn(`Stats ligue ${seasonId} ERREUR:`, e.message);
  }
}

/**
 * Toggle expand a league and load its table.
 * Returns { expandedLeague, leagueTable, tableLoading } state updates.
 */
export async function toggleExpandLeague(seasonId, currentExpanded) {
  if (currentExpanded === seasonId) {
    return { expandedLeague: null, leagueTable: null, tableLoading: false };
  }

  const result = { expandedLeague: seasonId, leagueTable: null, tableLoading: true };

  try {
    const table = await getLeagueTable(seasonId);
    result.leagueTable = table;
  } catch (e) {
    result.leagueTable = [];
    if (typeof window !== 'undefined' && window.showToast) {
      window.showToast(`Erreur : ${e.message}`, 'error');
    }
  }
  result.tableLoading = false;
  return result;
}
