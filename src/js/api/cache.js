/* ================================================
   cache.js — Mise en cache localStorage avec TTL
   FHG Tracker
   ================================================ */

const CACHE_PREFIX = 'fhg_cache_';
const DEFAULT_TTL  = 15 * 60 * 1000; // 15 minutes

/**
 * Lire une entrée du cache.
 * Retourne null si absente ou expirée.
 */
export function cacheGet(key) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (Date.now() > entry.expires) {
      localStorage.removeItem(CACHE_PREFIX + key);
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

/**
 * Écrire une entrée dans le cache avec TTL.
 * @param {string} key
 * @param {*} data
 * @param {number} ttl — durée en ms (défaut : 15 min)
 */
export function cacheSet(key, data, ttl = DEFAULT_TTL) {
  try {
    const entry = {
      data,
      expires: Date.now() + ttl,
      cachedAt: Date.now(),
    };
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
  } catch (e) {
    // localStorage plein ou indispo — on ignore silencieusement
    console.warn('Cache: impossible d\'écrire', key, e.message);
  }
}

/**
 * Invalider une entrée précise du cache.
 */
export function cacheInvalidate(key) {
  localStorage.removeItem(CACHE_PREFIX + key);
}

/**
 * Vider tout le cache (toutes les entrées fhg_cache_*)
 */
export function cacheClear() {
  const keys = Object.keys(localStorage).filter(k => k.startsWith(CACHE_PREFIX));
  keys.forEach(k => localStorage.removeItem(k));
  console.info(`Cache: ${keys.length} entrée(s) supprimée(s)`);
}

/**
 * Retourner les métadonnées du cache (pour debug / settings)
 */
export function cacheStats() {
  const keys = Object.keys(localStorage).filter(k => k.startsWith(CACHE_PREFIX));
  let total = 0;
  let expired = 0;
  keys.forEach(k => {
    try {
      const entry = JSON.parse(localStorage.getItem(k));
      total++;
      if (Date.now() > entry.expires) expired++;
    } catch {}
  });
  return { total, expired, active: total - expired };
}

/**
 * Générer une clé de cache à partir de paramètres.
 * Exemple : cacheKey('todays-matches', { date: '2026-03-27' })
 *   → "todays-matches_date=2026-03-27"
 */
export function cacheKey(endpoint, params = {}) {
  const parts = [endpoint];
  Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([k, v]) => parts.push(`${k}=${v}`));
  return parts.join('_');
}
