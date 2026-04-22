/* ================================================
   seedClient.js — Client pour la Netlify Function seed-data
   Orchestre le seed ligue par ligue depuis le browser.
   La Function fetch les données, le client insert dans Supabase.
   ================================================ */

const SEED_URL = '/.netlify/functions/seed-data';
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY doivent être définies');
}

async function seedRequest(params) {
  const url = new URL(SEED_URL, window.location.origin);
  Object.entries(params).forEach(([k, v]) => {
    if (v != null) url.searchParams.set(k, String(v));
  });
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('fhg_seed_token') : null;
  const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
  const res = await fetch(url.toString(), { headers });
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
        console.error(`[SEED] batch ${i} HTTP ${res.status}:`, text);
        console.error(`[SEED] sample row:`, JSON.stringify(batch[0]));
        errors.push(`batch ${i}: HTTP ${res.status} — ${text.slice(0, 200)}`);
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
