/**
 * Shared formatting and color utility functions used across pages.
 */

/**
 * Returns YYYY-MM-DD string for today + offset days.
 * @param {number} offset - Number of days from today (can be negative)
 * @returns {string}
 */
export function getDateStr(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().split('T')[0];
}

/**
 * Formats a date string (YYYY-MM-DD) to French locale (e.g. "22 avr.").
 * @param {string} dateStr
 * @returns {string}
 */
export function formatDate(dateStr) {
  if (!dateStr) return '\u2014';
  const d = new Date(dateStr);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

/**
 * Formats a unix timestamp to HH:MM in French locale.
 * @param {number} unix - Unix timestamp in seconds
 * @returns {string}
 */
export function formatTime(unix) {
  if (!unix) return '\u2014';
  return new Date(unix * 1000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Checks if a match/alert is currently in play (started less than 2 hours ago).
 * @param {object} a - Alert or match object with kickoff_unix
 * @returns {boolean}
 */
export function isInPlay(a) {
  if (!a.kickoff_unix) return false;
  const now = Math.floor(Date.now() / 1000);
  return a.kickoff_unix <= now && (now - a.kickoff_unix) < 7200;
}

/**
 * Returns a CSS color variable based on FHG percentage.
 * @param {number} pct
 * @returns {string}
 */
export function fhgColor(pct) {
  if (pct >= 65) return 'var(--color-accent-green)';
  if (pct >= 50) return 'var(--color-signal-moyen)';
  return 'var(--color-text-muted)';
}

/**
 * Returns a CSS color variable based on defeat percentage.
 * @param {number} pct
 * @returns {string}
 */
export function defeatColor(pct) {
  if (pct <= 20) return 'var(--color-accent-green)';
  if (pct <= 30) return 'var(--color-signal-moyen)';
  return 'var(--color-danger)';
}
