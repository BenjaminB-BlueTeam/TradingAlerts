/**
 * cache.js — Mise en cache localStorage des réponses API
 * TTL par défaut : 15 minutes
 */

const DEFAULT_TTL = 15 * 60 * 1000; // 15 minutes en ms

/**
 * Enregistrer une entrée dans le cache
 * @param {string} key
 * @param {*} data
 * @param {number} ttl - durée en ms
 */
export function cacheSet(key, data, ttl = DEFAULT_TTL) {
  try {
    const entry = {
      data,
      expires: Date.now() + ttl,
    };
    localStorage.setItem(`fhg_cache_${key}`, JSON.stringify(entry));
  } catch (e) {
    // Ignore les erreurs de storage (quota, etc.)
    console.warn('[Cache] Impossible d\'enregistrer:', key, e.message);
  }
}

/**
 * Lire une entrée du cache
 * @param {string} key
 * @returns {*|null} données ou null si absent/expiré
 */
export function cacheGet(key) {
  try {
    const raw = localStorage.getItem(`fhg_cache_${key}`);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (Date.now() > entry.expires) {
      localStorage.removeItem(`fhg_cache_${key}`);
      return null;
    }
    return entry.data;
  } catch (e) {
    return null;
  }
}

/**
 * Supprimer une entrée du cache
 * @param {string} key
 */
export function cacheDelete(key) {
  localStorage.removeItem(`fhg_cache_${key}`);
}

/**
 * Vider tout le cache FHG
 */
export function cacheClear() {
  const keys = Object.keys(localStorage).filter(k => k.startsWith('fhg_cache_'));
  keys.forEach(k => localStorage.removeItem(k));
}

/**
 * Obtenir les métadonnées du cache (taille, entrées)
 */
export function cacheInfo() {
  const keys = Object.keys(localStorage).filter(k => k.startsWith('fhg_cache_'));
  const now = Date.now();
  let valid = 0;
  let expired = 0;

  keys.forEach(k => {
    try {
      const entry = JSON.parse(localStorage.getItem(k));
      if (now < entry.expires) valid++;
      else expired++;
    } catch {
      expired++;
    }
  });

  return { total: keys.length, valid, expired };
}

/**
 * Wrapper pour requêtes avec mise en cache automatique
 * @param {string} key - clé de cache
 * @param {Function} fetchFn - fonction async retournant les données
 * @param {number} ttl - durée du cache
 * @returns {Promise<*>}
 */
export async function withCache(key, fetchFn, ttl = DEFAULT_TTL) {
  const cached = cacheGet(key);
  if (cached !== null) {
    return cached;
  }
  const data = await fetchFn();
  cacheSet(key, data, ttl);
  return data;
}
