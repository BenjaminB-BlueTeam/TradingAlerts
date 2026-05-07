import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — déclarés avant tout import du module testé.
// vi.mock est hoissé automatiquement par Vitest, donc ce bloc s'exécute
// avant les imports statiques du fichier de test.
// ---------------------------------------------------------------------------

const mockSignInWithPassword = vi.fn();
const mockSignOut = vi.fn();
const mockGetUser = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      signInWithPassword: (...args) => mockSignInWithPassword(...args),
      signOut:            (...args) => mockSignOut(...args),
      getUser:            (...args) => mockGetUser(...args),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    from: () => ({
      select: () => ({ data: [], error: null }),
      update: () => ({ data: [], error: null }),
    }),
  }),
}));

// Les env vars doivent être stubées avant l'import dynamique du module
// (supabase.js lance une Error si elles sont absentes).
vi.stubEnv('VITE_SUPABASE_URL',      'http://localhost:54321');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key');

// ---------------------------------------------------------------------------
// Import dynamique — résolu après que les stubs/mocks sont en place
// ---------------------------------------------------------------------------

let signIn, signOut, getCurrentUser;

beforeAll(async () => {
  const mod = await import('./supabase.js');
  signIn         = mod.signIn;
  signOut        = mod.signOut;
  getCurrentUser = mod.getCurrentUser;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

describe('signIn', () => {
  it('retourne user quand les identifiants sont valides', async () => {
    const fakeUser = { id: '1', email: 'test@example.com' };
    mockSignInWithPassword.mockResolvedValueOnce({ data: { user: fakeUser }, error: null });

    const result = await signIn('test@example.com', 'password');

    expect(result).toEqual({ user: fakeUser, error: null });
  });

  it('retourne un message traduit pour "Invalid login credentials"', async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      data: {},
      error: { message: 'Invalid login credentials' },
    });

    const result = await signIn('test@example.com', 'mauvais');

    expect(result).toEqual({ user: null, error: 'Email ou mot de passe incorrect' });
  });

  it('retourne le message brut pour une erreur non-"invalid"', async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      data: {},
      error: { message: 'Connexion impossible' },
    });

    const result = await signIn('test@example.com', 'password');

    expect(result).toEqual({ user: null, error: 'Connexion impossible' });
  });
});

describe('signOut', () => {
  it('retourne true quand la déconnexion réussit', async () => {
    mockSignOut.mockResolvedValueOnce({ error: null });

    const result = await signOut();

    expect(result).toBe(true);
  });

  it('retourne false quand Supabase renvoie une erreur', async () => {
    mockSignOut.mockResolvedValueOnce({ error: { message: 'network error' } });

    const result = await signOut();

    expect(result).toBe(false);
  });
});

describe('getCurrentUser', () => {
  it('retourne l\'user quand la session est active', async () => {
    const fakeUser = { id: '42', email: 'me@example.com' };
    mockGetUser.mockResolvedValueOnce({ data: { user: fakeUser }, error: null });

    const result = await getCurrentUser();

    expect(result).toEqual(fakeUser);
  });

  it('retourne null quand data.user est null (non connecté)', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });

    const result = await getCurrentUser();

    expect(result).toBeNull();
  });

  it('retourne null quand Supabase renvoie une erreur', async () => {
    mockGetUser.mockResolvedValueOnce({ data: {}, error: { message: 'jwt expired' } });

    const result = await getCurrentUser();

    expect(result).toBeNull();
  });
});
