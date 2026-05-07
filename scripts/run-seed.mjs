/**
 * run-seed.mjs — Orchestre le seed complet de facon autonome.
 * Appelle seed-data.js (Netlify Function) pour chaque saison.
 * Les inserts h2h_matches + teams sont faits server-side.
 *
 * Usage: node scripts/run-seed.mjs
 */

const BASE = 'https://tradingfootalerts.netlify.app/.netlify/functions/seed-data';
const TOKEN = process.env.SEED_AUTH_TOKEN || '3a1f7e46585f08c81cf403ed06da2bc86eccf0a186b58e7087c75067836686bf';
const DELAY_MS = 500; // pause entre chaque saison pour éviter rate-limit FootyStats

const headers = { 'Authorization': `Bearer ${TOKEN}` };

async function call(params) {
  const url = new URL(BASE);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url.toString(), { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${await res.text()}`);
  return res.json();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('=== SEED COMPLET ===');

  // 1. start_full — récupère la liste des ligues et season_ids
  console.log('[1/2] Récupération des ligues...');
  const startData = await call({ action: 'start_full' });
  const leagues = startData.leagues || [];
  console.log(`  → ${leagues.length} ligues, job_id=${startData.job_id}`);

  // Collecter tous les season_ids (5 saisons par ligue)
  const seasons = [];
  for (const lg of leagues) {
    for (const sid of (lg.season_ids || [])) {
      seasons.push({ seasonId: sid, leagueName: lg.name });
    }
  }
  console.log(`  → ${seasons.length} saisons à seeder\n`);

  // 2. seed_league pour chaque saison
  let done = 0;
  let totalMatches = 0;
  let errors = 0;

  for (const { seasonId, leagueName } of seasons) {
    try {
      const data = await call({ action: 'seed_league', league_id: seasonId });
      totalMatches += data.inserted || data.matches || 0;
      done++;
      process.stdout.write(`\r  [${done}/${seasons.length}] ${leagueName} (${seasonId}) — ${data.inserted ?? data.matches ?? 0} matchs`);
    } catch (e) {
      errors++;
      console.error(`\n  ❌ season ${seasonId}: ${e.message}`);
    }
    await sleep(DELAY_MS);
  }

  console.log(`\n\n=== TERMINÉ ===`);
  console.log(`  Saisons traitées : ${done}/${seasons.length}`);
  console.log(`  Total matchs insérés : ${totalMatches}`);
  if (errors > 0) console.log(`  Erreurs : ${errors}`);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
