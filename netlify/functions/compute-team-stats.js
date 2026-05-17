/* ================================================
   netlify/functions/compute-team-stats.js
   Tache planifiee — calcul LG1% et LG2% par equipe par saison.
   Lit h2h_matches (saison courante) et calcule 2 metriques par equipe :
   - lg1_after30_pct : % de matchs ou un but est tombe entre 31-45 min (stoppage 1MT compris)
   - lg2_pct         : % de matchs ou un but est tombe >= 80 min (stoppage 2MT compris)
   IMPORTANT : on compte les buts MATCH-LEVEL (peu importe qui marque, equipe ou adversaire)
   — oriente trading Over 0.5 dans la fenetre, pas algo streak offensif/defensif.
   Upserte dans team_lg1_cache.
   Tourne 1x/jour a 4h30 UTC (6h30 Paris) via Netlify Scheduled Functions, juste apres daily-seed.
   ================================================ */

const { requireAuth } = require('./lib/auth.cjs');
const { corsHeaders, handlePreflight } = require('./lib/cors.cjs');
const { startCronRun, endCronRun } = require('./lib/cronLog.cjs');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

function getCurrentSeasonStart() {
  const now = new Date();
  const year = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  return `${year}-07-01`;
}

/**
 * Un but est dans la fenetre LG1 (31-45 min, stoppage 1MT compris) si :
 * - raw contient "+" et la base est entre 31 et 45 inclus  (ex: "45+2" → oui, "30+1" → non, "90+3" → non)
 * - sinon 31 <= min <= 45
 */
function isLg1AfterMin30Goal(g) {
  if (g.raw && g.raw.includes('+')) {
    const base = parseInt(g.raw);
    return base >= 31 && base <= 45;
  }
  return g.min >= 31 && g.min <= 45;
}

/**
 * Un but est dans la fenetre LG2 (>= 80 min, stoppage 2MT compris) si :
 * - raw contient "+" : la base "+x" >= 80 (ex: "80+2" → oui, "90+3" → oui)
 * - sinon min >= 80
 */
function isLg2Goal(g) {
  if (g.raw && g.raw.includes('+')) {
    return parseInt(g.raw) >= 80;
  }
  return g.min >= 80;
}

async function fetchMatches(seasonStart) {
  const PAGE = 1000;
  let offset = 0;
  let all = [];
  while (true) {
    const url = `${SUPABASE_URL}/rest/v1/h2h_matches`
      + `?select=home_team_id,home_team_name,away_team_id,away_team_name,season_id,goal_events`
      + `&match_date=gte.${seasonStart}`
      + `&goal_events=not.is.null`
      + `&order=match_date.asc`
      + `&limit=${PAGE}&offset=${offset}`;
    const res = await fetch(url, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Range-Unit': 'items',
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`[compute-team-stats] Supabase fetch error: HTTP ${res.status} — ${txt.slice(0, 200)}`);
    }
    const batch = await res.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    all.push(...batch);
    if (batch.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

async function upsertCache(rows) {
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const url = `${SUPABASE_URL}/rest/v1/team_lg1_cache?on_conflict=season_id,team_id`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(batch),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`[compute-team-stats] upsert error: HTTP ${res.status} — ${txt.slice(0, 200)}`);
    }
  }
}

exports.handler = async function(event) {
  const preflight = handlePreflight(event);
  if (preflight) return preflight;

  const cors = corsHeaders(event.headers?.origin || event.headers?.Origin);

  const auth = requireAuth(event, { allowScheduled: true });
  if (!auth.authorized) return { ...auth.response, headers: { ...(auth.response.headers || {}), ...cors } };

  const seasonStart = getCurrentSeasonStart();
  const runId = await startCronRun('compute-team-stats', { season_start: seasonStart });

  try {
    console.log(`[compute-team-stats] Saison courante depuis ${seasonStart}`);

    const matches = await fetchMatches(seasonStart);
    console.log(`[compute-team-stats] ${matches.length} matchs charges`);

    if (matches.length === 0) {
      await endCronRun(runId, { status: 'success', count_processed: 0, count_updated: 0 });
      return { statusCode: 200, headers: cors, body: 'Aucun match — rien a calculer.' };
    }

    // Agregation : { "season_id:team_id" -> { season_id, team_id, team_name, total, lg1_after30, lg2 } }
    const stats = new Map();

    function addMatch(seasonId, teamId, teamName, goalEvents) {
      if (!seasonId || !teamId) return;
      const key = `${seasonId}:${teamId}`;
      if (!stats.has(key)) stats.set(key, { season_id: seasonId, team_id: teamId, team_name: teamName, total: 0, lg1_after30: 0, lg2: 0 });
      const s = stats.get(key);
      s.total++;
      const events = Array.isArray(goalEvents) ? goalEvents : [];
      // Match-level : n'importe quel but dans la fenetre compte (perspective trading Over 0.5)
      let hasLg1 = false;
      let hasLg2 = false;
      for (const g of events) {
        if (!hasLg1 && isLg1AfterMin30Goal(g)) hasLg1 = true;
        if (!hasLg2 && isLg2Goal(g)) hasLg2 = true;
        if (hasLg1 && hasLg2) break;
      }
      if (hasLg1) s.lg1_after30++;
      if (hasLg2) s.lg2++;
    }

    for (const m of matches) {
      addMatch(m.season_id, m.home_team_id, m.home_team_name, m.goal_events);
      addMatch(m.season_id, m.away_team_id, m.away_team_name, m.goal_events);
    }

    const rows = [];
    for (const s of stats.values()) {
      if (s.total === 0) continue;
      rows.push({
        season_id:        s.season_id,
        team_id:          s.team_id,
        team_name:        s.team_name,
        lg1_after30_pct:  Math.round(s.lg1_after30 / s.total * 100),
        lg2_pct:          Math.round(s.lg2 / s.total * 100),
        matches_count:    s.total,
        updated_at:       new Date().toISOString(),
      });
    }

    console.log(`[compute-team-stats] ${rows.length} equipes a upsert`);
    await upsertCache(rows);
    console.log(`[compute-team-stats] Done.`);

    await endCronRun(runId, {
      status: 'success',
      count_updated: rows.length,
      count_processed: matches.length,
    });

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ teams: rows.length, matches: matches.length }),
    };
  } catch (err) {
    console.error('[compute-team-stats] Erreur:', err.message);
    await endCronRun(runId, { status: 'error', error_message: err.message });
    return { statusCode: 500, headers: cors, body: err.message };
  }
};

// Netlify Scheduled Function — tous les jours a 4h30 UTC (6h30 Paris)
exports.config = {
  schedule: '30 4 * * *',
};
