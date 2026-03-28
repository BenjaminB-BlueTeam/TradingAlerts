/* ================================================
   seedClient.js — Client pour la Netlify Function seed-data
   Orchestre le seed ligue par ligue depuis le browser.
   La Function fetch les données, le client insert dans Supabase.
   ================================================ */

const SEED_URL = '/.netlify/functions/seed-data';
const SUPABASE_URL = 'https://ikpafgqjmjifpaulctmx.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlrcGFmZ3FqbWppZnBhdWxjdG14Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2ODMxMzAsImV4cCI6MjA5MDI1OTEzMH0._01tjkB0WvN4xeHH78HIDqZk9BIhDxb9qYJ7dYystso';

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

  // 2. Insert dans Supabase côté client via REST API (pas de timeout)
  const errors = [];
  const BATCH = 200;
  for (let i = 0; i < data.rows.length; i += BATCH) {
    const batch = data.rows.slice(i, i + BATCH);
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/h2h_matches?on_conflict=match_id`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify(batch),
      });
      if (!res.ok) {
        const text = await res.text();
        errors.push(`batch ${i}: HTTP ${res.status} — ${text.slice(0, 100)}`);
      }
    } catch (e) {
      errors.push(`batch ${i}: ${e.message}`);
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
