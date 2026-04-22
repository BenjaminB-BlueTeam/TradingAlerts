/* ================================================
   cache.js — Mise en cache localStorage avec TTL
   FHG Tracker
   ================================================ */

const CACHE_PREFIX = 'fhg_cache_';
const DEFAULT_TTL  = 15 * 60 * 1000; // 15 minutes

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

export function cacheSet(key, data, ttl = DEFAULT_TTL) {
  try {
    const entry = {
      data,
      expires: Date.now() + ttl,
      cachedAt: Date.now(),
    };
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
  } catch (e) {
    console.warn('Cache: impossible d\'écrire', key, e.message);
  }
}

export function cacheInvalidate(key) {
  localStorage.removeItem(CACHE_PREFIX + key);
}

export function cacheClear() {
  const keys = Object.keys(localStorage).filter(k => k.startsWith(CACHE_PREFIX));
  keys.forEach(k => localStorage.removeItem(k));
  console.info(`Cache: ${keys.length} entrée(s) supprimée(s)`);
}

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

export function cacheEvict() {
  const now = Date.now();
  let evicted = 0;
  const keys = Object.keys(localStorage).filter(k => k.startsWith(CACHE_PREFIX));
  // Supprimer les entrées expirées
  keys.forEach(k => {
    try {
      const entry = JSON.parse(localStorage.getItem(k));
      if (now > entry.expires) {
        localStorage.removeItem(k);
        evicted++;
      }
    } catch {
      localStorage.removeItem(k);
      evicted++;
    }
  });
  // Si le cache est encore trop gros (>3MB), supprimer les plus anciennes entrées
  const remaining = Object.keys(localStorage).filter(k => k.startsWith(CACHE_PREFIX));
  let totalSize = 0;
  const entries = [];
  remaining.forEach(k => {
    const raw = localStorage.getItem(k);
    if (!raw) return;
    totalSize += raw.length * 2; // UTF-16
    try {
      const entry = JSON.parse(raw);
      entries.push({ key: k, cachedAt: entry.cachedAt || 0, size: raw.length * 2 });
    } catch {}
  });
  const MAX_SIZE = 3 * 1024 * 1024; // 3 MB
  if (totalSize > MAX_SIZE) {
    entries.sort((a, b) => a.cachedAt - b.cachedAt); // plus ancien en premier
    while (totalSize > MAX_SIZE && entries.length > 0) {
      const oldest = entries.shift();
      localStorage.removeItem(oldest.key);
      totalSize -= oldest.size;
      evicted++;
    }
  }
  if (evicted > 0) console.info(`Cache: ${evicted} entrée(s) supprimée(s)`);
}

export function cacheKey(endpoint, params = {}) {
  const parts = [endpoint];
  Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([k, v]) => parts.push(`${k}=${v}`));
  return parts.join('_');
}
