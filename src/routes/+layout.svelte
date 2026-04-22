<script>
  import { onMount } from 'svelte';
  import '../app.css';
  import Sidebar from '$lib/components/Sidebar.svelte';
  import Toast from '$lib/components/Toast.svelte';
  import { loadFromStorage } from '$lib/stores/appStore.js';
  import { loadTradesFromSupabase } from '$lib/stores/tradeStore.js';
  import { initApp } from '$lib/data.js';
  import { cacheEvict } from '$lib/api/cache.js';

  let { children } = $props();

  let toasts = $state([]);
  let initialized = $state(false);

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

    initialized = true;
  });

</script>

<a href="#main-content" class="skip-link">Aller au contenu</a>

<div class="app-layout">
  <Sidebar />

  <main class="main-content" id="main-content">
    <div class="page-container">
      {@render children()}
    </div>
  </main>
</div>

<!-- TOAST CONTAINER -->
<div class="toast-container">
  {#each toasts as toast (toast.id)}
    <Toast message={toast.message} type={toast.type} />
  {/each}
</div>
