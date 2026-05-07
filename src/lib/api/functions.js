const TOKEN = import.meta.env.VITE_FUNCTIONS_AUTH_TOKEN || '';

export async function callFunction(path, options = {}) {
  const headers = {
    ...(options.headers || {}),
    ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
  };
  return fetch(path, { ...options, headers });
}
