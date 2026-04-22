import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getDateStr, formatDate, formatTime, isInPlay, fhgColor, defeatColor } from './formatters.js';

describe('getDateStr', () => {
  it('returns today in YYYY-MM-DD format when offset is 0', () => {
    const result = getDateStr(0);
    const expected = new Date().toISOString().split('T')[0];
    expect(result).toBe(expected);
  });

  it('returns tomorrow when offset is 1', () => {
    const result = getDateStr(1);
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const expected = d.toISOString().split('T')[0];
    expect(result).toBe(expected);
  });

  it('returns yesterday when offset is -1', () => {
    const result = getDateStr(-1);
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const expected = d.toISOString().split('T')[0];
    expect(result).toBe(expected);
  });

  it('returns a valid date string format', () => {
    const result = getDateStr(5);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('formatDate', () => {
  it('returns em-dash for falsy input', () => {
    expect(formatDate(null)).toBe('\u2014');
    expect(formatDate('')).toBe('\u2014');
    expect(formatDate(undefined)).toBe('\u2014');
  });

  it('formats a valid date string to French locale', () => {
    const result = formatDate('2026-04-22');
    // French locale should contain "22" and "avr" (abbreviated April)
    expect(result).toContain('22');
    expect(result.toLowerCase()).toMatch(/avr/);
  });
});

describe('formatTime', () => {
  it('returns em-dash for falsy input', () => {
    expect(formatTime(0)).toBe('\u2014');
    expect(formatTime(null)).toBe('\u2014');
    expect(formatTime(undefined)).toBe('\u2014');
  });

  it('converts unix timestamp to HH:MM format', () => {
    // 1713800400 = 2024-04-22 some time
    const result = formatTime(1713800400);
    // Should match HH:MM pattern
    expect(result).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe('isInPlay', () => {
  it('returns false when kickoff_unix is missing', () => {
    expect(isInPlay({})).toBe(false);
    expect(isInPlay({ kickoff_unix: 0 })).toBe(false);
    expect(isInPlay({ kickoff_unix: null })).toBe(false);
  });

  it('returns true when match started less than 2 hours ago', () => {
    const nowUnix = Math.floor(Date.now() / 1000);
    // Match started 30 minutes ago
    expect(isInPlay({ kickoff_unix: nowUnix - 1800 })).toBe(true);
  });

  it('returns false when match started more than 2 hours ago', () => {
    const nowUnix = Math.floor(Date.now() / 1000);
    // Match started 3 hours ago
    expect(isInPlay({ kickoff_unix: nowUnix - 10800 })).toBe(false);
  });

  it('returns false when match has not started yet', () => {
    const nowUnix = Math.floor(Date.now() / 1000);
    // Match starts in 1 hour
    expect(isInPlay({ kickoff_unix: nowUnix + 3600 })).toBe(false);
  });

  it('returns true when match just started (kickoff_unix equals now)', () => {
    const nowUnix = Math.floor(Date.now() / 1000);
    expect(isInPlay({ kickoff_unix: nowUnix })).toBe(true);
  });
});

describe('fhgColor', () => {
  it('returns green for pct >= 65', () => {
    expect(fhgColor(65)).toBe('var(--color-accent-green)');
    expect(fhgColor(95)).toBe('var(--color-accent-green)');
  });

  it('returns moyen color for pct >= 50 and < 65', () => {
    expect(fhgColor(50)).toBe('var(--color-signal-moyen)');
    expect(fhgColor(64)).toBe('var(--color-signal-moyen)');
  });

  it('returns muted color for pct < 50', () => {
    expect(fhgColor(49)).toBe('var(--color-text-muted)');
    expect(fhgColor(0)).toBe('var(--color-text-muted)');
  });
});

describe('defeatColor', () => {
  it('returns green for pct <= 20', () => {
    expect(defeatColor(20)).toBe('var(--color-accent-green)');
    expect(defeatColor(0)).toBe('var(--color-accent-green)');
  });

  it('returns moyen color for pct <= 30 and > 20', () => {
    expect(defeatColor(21)).toBe('var(--color-signal-moyen)');
    expect(defeatColor(30)).toBe('var(--color-signal-moyen)');
  });

  it('returns danger color for pct > 30', () => {
    expect(defeatColor(31)).toBe('var(--color-danger)');
    expect(defeatColor(100)).toBe('var(--color-danger)');
  });
});
