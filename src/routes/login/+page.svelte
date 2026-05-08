<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { get } from 'svelte/store';
  import { signIn, getCurrentUser } from '$lib/api/supabase.js';

  let email    = $state('');
  let password = $state('');
  let loading  = $state(false);
  let errorMsg = $state('');

  onMount(async () => {
    const user = await getCurrentUser();
    if (user) goto('/');
  });

  async function handleSubmit(e) {
    e.preventDefault();
    loading  = true;
    errorMsg = '';

    const { user, error } = await signIn(email.trim(), password);
    loading = false;

    if (error) {
      errorMsg = error;
      return;
    }

    const params = get(page).url.searchParams;
    const raw = params.get('redirect') || '/';
    let decoded;
    try { decoded = decodeURIComponent(raw); } catch { decoded = '/'; }
    const safe = /^\/(?![/\\])/.test(decoded) ? decoded : '/';
    goto(safe, { replaceState: true });
  }

  let canSubmit = $derived(!loading && email.trim().length > 0 && password.length > 0);
</script>

<div class="login-page">
  <div class="login-card">
    <div class="login-card__header">
      <span class="login-card__logo-icon">⚽</span>
      <h1 class="login-card__title">Late Goal Tracker</h1>
      <p class="login-card__subtitle">Connexion requise</p>
    </div>

    <form class="login-form" onsubmit={handleSubmit} novalidate>
      <div class="form-group">
        <label class="form-label" for="login-email">Email</label>
        <input
          id="login-email"
          type="email"
          class="form-input"
          bind:value={email}
          placeholder="vous@exemple.com"
          autocomplete="email"
          required
          disabled={loading}
        />
      </div>

      <div class="form-group">
        <label class="form-label" for="login-password">Mot de passe</label>
        <input
          id="login-password"
          type="password"
          class="form-input form-input--password"
          bind:value={password}
          placeholder="••••••••"
          autocomplete="current-password"
          required
          disabled={loading}
        />
      </div>

      {#if errorMsg}
        <div class="login-error" role="alert">
          {errorMsg}
        </div>
      {/if}

      <button
        type="submit"
        class="btn btn--primary btn--full login-btn"
        disabled={!canSubmit}
      >
        {#if loading}
          <span class="login-spinner"></span>
          Connexion…
        {:else}
          Se connecter
        {/if}
      </button>
    </form>
  </div>
</div>

<style>
  .login-page {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 24px;
    background: var(--color-bg-primary);
  }

  .login-card {
    width: 100%;
    max-width: 380px;
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: 16px;
    padding: 36px 32px 32px;
    box-shadow: var(--shadow-modal);
  }

  .login-card__header {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    margin-bottom: 28px;
    text-align: center;
  }

  .login-card__logo-icon {
    font-size: 40px;
    line-height: 1;
  }

  .login-card__title {
    font-size: 20px;
    font-weight: 700;
    color: var(--color-text-primary);
    margin: 0;
  }

  .login-card__subtitle {
    font-size: 13px;
    color: var(--color-text-muted);
    margin: 0;
  }

  .login-form {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .login-error {
    background: rgba(226, 75, 74, 0.1);
    border: 1px solid rgba(226, 75, 74, 0.3);
    border-radius: 8px;
    padding: 10px 12px;
    font-size: 13px;
    color: var(--color-danger);
    margin-bottom: 4px;
  }

  .login-btn {
    margin-top: 8px;
    padding: 11px 16px;
    font-size: 14px;
    font-weight: 600;
    gap: 8px;
  }

  .login-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .login-spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: #fff;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
    flex-shrink: 0;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  @media (max-width: 440px) {
    .login-card {
      padding: 28px 20px 24px;
    }
  }
</style>
