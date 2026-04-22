<script>
  import { clearAllData } from '$lib/stores/appStore.js';
  import { cacheClear } from '$lib/api/cache.js';

  function handleClearCache() {
    cacheClear();
    if (typeof window !== 'undefined' && window.showToast) {
      window.showToast('Cache API vide', 'success');
    }
  }

  function handleClearAll() {
    if (confirm('Reinitialiser TOUTES les donnees ? Cette action est irreversible.')) {
      clearAllData();
    }
  }
</script>

<div class="settings-block">
  <div class="settings-block__title" style="color:var(--color-danger);">🗑 Zone de danger</div>
  <div class="danger-box mb-16" style="font-size:12px;">
    ⚠ Ces actions sont irreversibles. Toutes vos donnees locales seront supprimees.
  </div>
  <div style="display:flex;gap:8px;flex-wrap:wrap;">
    <button class="btn btn--danger" onclick={handleClearCache}>🗑 Vider le cache API</button>
    <button class="btn btn--danger" onclick={handleClearAll}>⚠ Reinitialiser toutes les donnees</button>
  </div>
</div>
