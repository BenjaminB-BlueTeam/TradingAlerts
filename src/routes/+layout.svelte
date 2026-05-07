<script>
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import '../app.css';
  import Sidebar from '$lib/components/Sidebar.svelte';
  import Toast from '$lib/components/Toast.svelte';
  import { loadFromStorage } from '$lib/stores/appStore.js';
  import { loadTradesFromSupabase } from '$lib/stores/tradeStore.js';
  import { loadSelections } from '$lib/stores/selectionStore.js';
  import { initApp } from '$lib/data.js';
  import { cacheEvict } from '$lib/api/cache.js';
  import { supabase } from '$lib/api/supabase.js';

  let { children } = $props();

  let isLoginPage = $derived($page.url.pathname === '/login');

  let toasts = $state([]);
  let initialized = $state(false);
  let authSub;

  // Expose showToast globalement pour les composants non-Svelte
  if (typeof window !== 'undefined') {
    window.showToast = addToast;
  }

  function addToast(message, type = 'info') {
    const id = Date.now();
    toasts = [...toasts, { id, message, type }];
    setTimeout(() => {
      toasts = toasts.filter(t => t.id !== id);
    }, 3500);
  }

  onMount(async () => {
    cacheEvict();
    loadFromStorage();

    // Test API + chargement données en parallèle
    const [apiStatus] = await Promise.all([
      initApp(),
      loadTradesFromSupabase(),
      loadSelections(),
    ]);

    initialized = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || (event === 'TOKEN_REFRESHED' && !session)) {
        const path = typeof window !== 'undefined' ? window.location.pathname : '/';
        const qs = (path && path !== '/' && path !== '/login')
          ? `?redirect=${encodeURIComponent(path)}`
          : '';
        goto(`/login${qs}`, { replaceState: true });
      }
    });
    authSub = subscription;
  });

  onDestroy(() => authSub?.unsubscribe());

</script>

<a href="#main-content" class="skip-link">Aller au contenu</a>

{#if isLoginPage}
  <main id="main-content">
    {@render children()}
  </main>
{:else}
  <div class="app-layout">
    <Sidebar />
    <main class="main-content" id="main-content">
      <div class="page-container">
        {@render children()}
      </div>
    </main>
  </div>
{/if}

<!-- TOAST CONTAINER -->
<div class="toast-container">
  {#each toasts as toast (toast.id)}
    <Toast message={toast.message} type={toast.type} />
  {/each}
</div>
