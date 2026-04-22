<script>
  import { onMount } from 'svelte';
  import '../app.css';
  import Sidebar from '$lib/components/Sidebar.svelte';
  import Toast from '$lib/components/Toast.svelte';
  import {
    loadFromStorage, loadTradesFromSupabase
  } from '$lib/stores/appStore.js';
  import { initApp, loadData } from '$lib/data.js';
  import { cacheEvict } from '$lib/api/cache.js';

  let toasts = [];
  let initialized = false;

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
    ]);

    await loadData();
    initialized = true;

    // Auto-refresh toutes les 10 minutes
    const interval = setInterval(() => {
      import('$lib/stores/appStore.js').then(({ pauseSession, get }) => {
        // On recharge seulement si pas en pause
        loadData();
      });
    }, 10 * 60 * 1000);

    return () => clearInterval(interval);
  });

</script>

<div class="app-layout">
  <Sidebar />

  <main class="main-content">
    <div class="page-container">
      <slot />
    </div>
  </main>
</div>

<!-- TOAST CONTAINER -->
<div class="toast-container">
  {#each toasts as toast (toast.id)}
    <Toast message={toast.message} type={toast.type} />
  {/each}
</div>
