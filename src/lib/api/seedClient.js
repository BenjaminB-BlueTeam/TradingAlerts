/* ================================================
   seedClient.js — Client pour la Netlify Function seed-data
   Orchestre le seed ligue par ligue depuis le browser.
   La Function fetch les données, le client insert dans Supabase.
   ================================================ */

import { supabase } from '$lib/api/supabase.js';

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
 * Seed une saison : fetch via Netlify Function, insert via Supabase client.
 * @param {string|number} seasonId
 * @returns {{ matches: number, errors: string[] }}
 */
export async function seedLeague(seasonId) {
  // 1. Fetch les données via la Netlify Function (proxy API FootyStats)
  const data = await seedRequest({
    action: 'seed_league',
    league_id: String(seasonId),
  });

  if (!data.rows || data.rows.length === 0) {
    return { matches: 0, errors: data.errors || [] };
  }

  // 2. Insert dans Supabase côté client (pas de timeout)
  const errors = [];
  const BATCH = 200;
  for (let i = 0; i < data.rows.length; i += BATCH) {
    const batch = data.rows.slice(i, i + BATCH);
    const { error } = await supabase
      .from('h2h_matches')
      .upsert(batch, { onConflict: 'match_id' });
    if (error) {
      errors.push(`batch ${i}: ${error.message}`);
    }
  }

  return {
    matches: data.rows.length,
    errors: [...(data.errors || []), ...errors],
  };
}

/**
 * Récupère le statut d'un seed job.
 */
export async function getSeedStatus(jobId) {
  return await seedRequest({ action: 'status', job_id: jobId });
}
