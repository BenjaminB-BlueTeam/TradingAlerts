/* ================================================
   seedClient.js — Client pour la Netlify Function seed-data
   Orchestre le seed ligue par ligue depuis le browser
   ================================================ */

const SEED_URL = '/.netlify/functions/seed-data';

async function seedRequest(params) {
  const url = new URL(SEED_URL, window.location.origin);
  Object.entries(params).forEach(([k, v]) => {
    if (v != null) url.searchParams.set(k, String(v));
  });
  const res = await fetch(url.toString());
  return await res.json();
}

/**
 * Démarre un job de seed complet.
 * Retourne { job_id, leagues: [...] }
 */
export async function startFullSeed() {
  return await seedRequest({ action: 'start_full' });
}

/**
 * Seed une ligue (toutes ses saisons).
 * @param {string|number} leagueIdOrIds — un ID ou plusieurs IDs séparés par des virgules
 * @param {number} jobId
 */
export async function seedLeague(leagueIdOrIds, jobId) {
  return await seedRequest({
    action: 'seed_league',
    league_id: String(leagueIdOrIds),
    job_id: jobId,
  });
}

/**
 * Récupère le statut d'un seed job.
 */
export async function getSeedStatus(jobId) {
  return await seedRequest({ action: 'status', job_id: jobId });
}
