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
 * Seed une seule ligue (toutes ses saisons).
 * @param {number} leagueId
 * @param {number} jobId
 * @param {number} seasons — nombre de saisons (défaut 3)
 */
export async function seedLeague(leagueId, jobId, seasons = 3) {
  return await seedRequest({
    action: 'seed_league',
    league_id: leagueId,
    job_id: jobId,
    seasons,
  });
}

/**
 * Récupère le statut d'un seed job.
 */
export async function getSeedStatus(jobId) {
  return await seedRequest({ action: 'status', job_id: jobId });
}
