/* ================================================
   filters.js — Filtres et tris des signaux
   FHG Tracker
   ================================================ */

export function isWindowActive(matchTime) {
  if (!matchTime) return false;
  const now = new Date();
  const [h, m] = matchTime.split(':').map(Number);
  const matchStart = new Date();
  matchStart.setHours(h, m, 0, 0);

  const elapsed = Math.floor((now - matchStart) / 60000);
  return elapsed >= 30 && elapsed <= 45;
}
