/* ================================================
   historyFilters.js — Fonctions pures pour /historique.
   Filtrage AND strict + agrégations pour les 4 graphiques.
   ================================================ */

export const FHG_SIGNALS = ['FHG_A', 'FHG_B', 'FHG_A+B', 'FHG_C', 'FHG_D', 'FHG', 'FHG_DOM', 'FHG_EXT'];
export const LG2_SIGNALS = ['LG2_A', 'LG2_B', 'LG2_A+B'];

export function strategyOf(alert) {
  if (!alert?.signal_type) return null;
  if (FHG_SIGNALS.includes(alert.signal_type)) return 'FHG';
  if (LG2_SIGNALS.includes(alert.signal_type)) return 'LG2';
  if (alert.signal_type === 'DC') return 'DC';
  return null;
}

/**
 * Applique tous les filtres AND strict.
 * filters = { dateFrom, dateTo, strategy, confidence, team, league, status }
 */
export function applyFilters(alerts, filters) {
  if (!Array.isArray(alerts)) return [];
  const {
    dateFrom = null, dateTo = null,
    strategy = 'tous', confidence = 'tous',
    team = null, league = null,
    status = 'terminees',
  } = filters || {};

  return alerts.filter(a => {
    if (dateFrom && a.match_date < dateFrom) return false;
    if (dateTo   && a.match_date > dateTo)   return false;
    if (strategy !== 'tous' && strategyOf(a) !== strategy.toUpperCase()) return false;
    if (confidence !== 'tous' && a.confidence !== confidence) return false;
    if (team !== null && a.home_team_id !== team && a.away_team_id !== team) return false;
    if (league !== null && a.league_name !== league) return false;
    if (status === 'terminees' && !['validated', 'lost'].includes(a.status)) return false;
    if (status === 'validated' && a.status !== 'validated') return false;
    if (status === 'lost'      && a.status !== 'lost')      return false;
    if (status === 'encours'   && a.status !== 'pending')   return false;
    return true;
  });
}

/**
 * Agrégation pour Chart B — validés / perdus par stratégie.
 * Considère uniquement les alertes terminées.
 */
export function aggregateByStrategy(alerts) {
  const out = { FHG: { validated: 0, lost: 0 }, DC: { validated: 0, lost: 0 }, LG2: { validated: 0, lost: 0 } };
  for (const a of alerts) {
    if (a.status !== 'validated' && a.status !== 'lost') continue;
    const s = strategyOf(a);
    if (!s || !out[s]) continue;
    if (a.status === 'validated') out[s].validated++;
    else out[s].lost++;
  }
  for (const k of Object.keys(out)) {
    const v = out[k];
    v.total = v.validated + v.lost;
    v.pct = v.total ? Math.round((v.validated / v.total) * 100) : null;
  }
  return out;
}

/**
 * Agrégation pour Chart C — top N équipes par taux.
 * Considère uniquement les alertes terminées.
 * minMatches : seuil pour qu'une équipe apparaisse (évite 1/1 = 100%).
 */
export function aggregateByTeam(alerts, { minMatches = 3, topN = 10 } = {}) {
  const map = new Map();
  function bump(id, name, won) {
    if (!id) return;
    if (!map.has(id)) map.set(id, { teamId: id, teamName: name, validated: 0, lost: 0 });
    const row = map.get(id);
    if (won) row.validated++; else row.lost++;
    if (name && !row.teamName) row.teamName = name;
  }
  for (const a of alerts) {
    if (a.status !== 'validated' && a.status !== 'lost') continue;
    const won = a.status === 'validated';
    bump(a.home_team_id, a.home_team_name, won);
    bump(a.away_team_id, a.away_team_name, won);
  }
  const rows = Array.from(map.values())
    .map(r => ({ ...r, total: r.validated + r.lost }))
    .filter(r => r.total >= minMatches)
    .map(r => ({ ...r, pct: r.total ? Math.round((r.validated / r.total) * 100) : 0 }))
    .sort((a, b) => b.pct - a.pct || b.total - a.total || a.teamName.localeCompare(b.teamName));
  return rows.slice(0, topN);
}

/**
 * Agrégation pour Chart D — top N ligues.
 */
export function aggregateByLeague(alerts, { minMatches = 3, topN = 10 } = {}) {
  const map = new Map();
  for (const a of alerts) {
    if (a.status !== 'validated' && a.status !== 'lost') continue;
    const name = a.league_name || '—';
    if (!map.has(name)) map.set(name, { leagueName: name, validated: 0, lost: 0 });
    const row = map.get(name);
    if (a.status === 'validated') row.validated++; else row.lost++;
  }
  const rows = Array.from(map.values())
    .map(r => ({ ...r, total: r.validated + r.lost }))
    .filter(r => r.total >= minMatches)
    .map(r => ({ ...r, pct: r.total ? Math.round((r.validated / r.total) * 100) : 0 }))
    .sort((a, b) => b.pct - a.pct || b.total - a.total || a.leagueName.localeCompare(b.leagueName));
  return rows.slice(0, topN);
}

/**
 * Agrégation pour Chart A — évolution par date.
 * granularity : 'jour' | 'mois' | 'annee'
 * Retourne un tableau trié par bucket ascendant :
 * [{ bucket: '2026-04-23', FHG: {v, t}, DC: {...}, LG2: {...} }, ...]
 */
export function aggregateByDate(alerts, granularity = 'jour') {
  function bucketOf(dateStr) {
    if (!dateStr) return null;
    if (granularity === 'annee') return dateStr.slice(0, 4);
    if (granularity === 'mois')  return dateStr.slice(0, 7);
    return dateStr;
  }

  const map = new Map();
  for (const a of alerts) {
    if (a.status !== 'validated' && a.status !== 'lost') continue;
    const b = bucketOf(a.match_date);
    if (!b) continue;
    if (!map.has(b)) map.set(b, { bucket: b, FHG: { v: 0, t: 0 }, DC: { v: 0, t: 0 }, LG2: { v: 0, t: 0 } });
    const row = map.get(b);
    const s = strategyOf(a);
    if (!s || !row[s]) continue;
    row[s].t++;
    if (a.status === 'validated') row[s].v++;
  }
  return Array.from(map.values()).sort((a, b) => a.bucket.localeCompare(b.bucket));
}

/**
 * Pour chaque bucket et chaque stratégie : v/t → pct (ou null si t=0).
 */
export function rateForBuckets(buckets, strategy) {
  return buckets.map(b => {
    const row = b[strategy];
    if (!row || row.t === 0) return { bucket: b.bucket, pct: null, v: 0, t: 0 };
    return { bucket: b.bucket, pct: Math.round((row.v / row.t) * 100), v: row.v, t: row.t };
  });
}
