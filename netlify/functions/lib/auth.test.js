import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { requireAuth } = require('./auth.cjs');

const VALID_TOKEN = 'supersecrettoken123';

function makeEvent({ method = 'GET', headers = {}, body = null } = {}) {
  return { httpMethod: method, headers, body };
}

describe('requireAuth', () => {
  let savedToken;

  beforeEach(() => {
    savedToken = process.env.FUNCTIONS_AUTH_TOKEN;
    process.env.FUNCTIONS_AUTH_TOKEN = VALID_TOKEN;
  });

  afterEach(() => {
    if (savedToken === undefined) {
      delete process.env.FUNCTIONS_AUTH_TOKEN;
    } else {
      process.env.FUNCTIONS_AUTH_TOKEN = savedToken;
    }
  });

  it('1. header absent → 401', () => {
    const result = requireAuth(makeEvent({ headers: {} }));
    expect(result.authorized).toBe(false);
    expect(result.response.statusCode).toBe(401);
  });

  it('2. header non-Bearer ("Token abc") → 401', () => {
    const result = requireAuth(makeEvent({ headers: { authorization: 'Token abc' } }));
    expect(result.authorized).toBe(false);
    expect(result.response.statusCode).toBe(401);
  });

  it('3. Bearer vide ("Bearer ") → 401', () => {
    const result = requireAuth(makeEvent({ headers: { authorization: 'Bearer ' } }));
    expect(result.authorized).toBe(false);
    expect(result.response.statusCode).toBe(401);
  });

  it('4. Bearer + mauvais token (longueur différente) → 401', () => {
    const result = requireAuth(makeEvent({ headers: { authorization: 'Bearer wrongtoken1234' } }));
    expect(result.authorized).toBe(false);
    expect(result.response.statusCode).toBe(401);
  });

  it('4b. Bearer + mauvais token (même longueur) → 401 (timingSafeEqual exercé)', () => {
    // VALID_TOKEN = 'supersecrettoken123' (19 chars) — même longueur, bytes différents
    const result = requireAuth(makeEvent({ headers: { authorization: 'Bearer supersecrettoken000' } }));
    expect(result.authorized).toBe(false);
    expect(result.response.statusCode).toBe(401);
  });

  it('5. Bearer + bon token → authorized', () => {
    const result = requireAuth(makeEvent({ headers: { authorization: `Bearer ${VALID_TOKEN}` } }));
    expect(result.authorized).toBe(true);
    expect(result.source).toBe('bearer');
  });

  it('6. Header "Authorization" (majuscule) + bon token → authorized', () => {
    // Le code lit headers?.authorization || headers?.Authorization
    // Avec le bon token dans Authorization (majuscule), doit être authorized
    const result = requireAuth(makeEvent({ headers: { Authorization: `Bearer ${VALID_TOKEN}` } }));
    expect(result.authorized).toBe(true);
    expect(result.source).toBe('bearer');
  });

  it('7. POST body {"next_run":"..."} sans header sans allowScheduled → 401 (bypass bloqué)', () => {
    const result = requireAuth(makeEvent({
      method: 'POST',
      headers: {},
      body: JSON.stringify({ next_run: '2026-05-07T12:00:00Z' }),
    }));
    expect(result.authorized).toBe(false);
    expect(result.response.statusCode).toBe(401);
  });

  it('7b. POST body {"next_run":"..."} avec allowScheduled: true → authorized (cron)', () => {
    const result = requireAuth(makeEvent({
      method: 'POST',
      headers: {},
      body: JSON.stringify({ next_run: '2026-05-07T12:00:00Z' }),
    }), { allowScheduled: true });
    expect(result.authorized).toBe(true);
    expect(result.source).toBe('scheduled');
  });

  it('8. POST body JSON sans next_run → 401', () => {
    const result = requireAuth(makeEvent({
      method: 'POST',
      headers: {},
      body: JSON.stringify({ action: 'run' }),
    }));
    expect(result.authorized).toBe(false);
    expect(result.response.statusCode).toBe(401);
  });

  it('9. POST body non-JSON → 401 (pas de throw)', () => {
    const result = requireAuth(makeEvent({
      method: 'POST',
      headers: {},
      body: 'not valid json }{',
    }));
    expect(result.authorized).toBe(false);
    expect(result.response.statusCode).toBe(401);
  });

  it('10. FUNCTIONS_AUTH_TOKEN absent → 401 même avec Bearer valide', () => {
    delete process.env.FUNCTIONS_AUTH_TOKEN;
    const result = requireAuth(makeEvent({ headers: { authorization: `Bearer ${VALID_TOKEN}` } }));
    expect(result.authorized).toBe(false);
    expect(result.response.statusCode).toBe(401);
  });
});
