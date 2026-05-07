const crypto = require('crypto');

function requireAuth(event, { allowScheduled = false } = {}) {
  if (allowScheduled && event.httpMethod === 'POST' && typeof event.body === 'string') {
    try {
      const parsed = JSON.parse(event.body);
      if (parsed && typeof parsed === 'object' && 'next_run' in parsed) {
        return { authorized: true, source: 'scheduled' };
      }
    } catch { /* body non-JSON, on continue */ }
  }

  const expected = process.env.FUNCTIONS_AUTH_TOKEN;
  if (!expected) {
    console.warn('[auth] FUNCTIONS_AUTH_TOKEN absent — 401');
    return unauthorized('Server misconfigured');
  }

  const header = event.headers?.authorization || event.headers?.Authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/);
  if (!match || !match[1].trim()) {
    return unauthorized('Missing or invalid Bearer token');
  }

  const provided = match[1].trim();
  if (provided.length !== expected.length) {
    return unauthorized('Invalid token');
  }
  try {
    if (!crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) {
      return unauthorized('Invalid token');
    }
  } catch {
    return unauthorized('Invalid token');
  }

  return { authorized: true, source: 'bearer' };
}

function unauthorized(reason) {
  console.warn('[auth] 401:', reason);
  return {
    authorized: false,
    response: {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Unauthorized' }),
    },
  };
}

module.exports = { requireAuth };
