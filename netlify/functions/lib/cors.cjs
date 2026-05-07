const ALLOWED_ORIGIN = 'https://tradingfootalerts.netlify.app';

const corsHeaders = (origin) => {
  const isDev = origin && (
    origin.startsWith('http://localhost') ||
    origin.startsWith('http://127.0.0.1')
  );
  const allowed = isDev ? origin : ALLOWED_ORIGIN;
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
};

const handlePreflight = (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders(event.headers?.origin || event.headers?.Origin),
      body: '',
    };
  }
  return null;
};

module.exports = { corsHeaders, handlePreflight, ALLOWED_ORIGIN };
