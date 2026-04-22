<script>
  import { apiConnected } from '$lib/stores/appStore.js';
  import { testApiConnection } from '$lib/api/footystats.js';

  let apiTestResult = $state(null);
  let apiTesting = $state(false);

  async function handleTestApi() {
    apiTesting = true;
    apiTestResult = null;
    const result = await testApiConnection();
    apiTestResult = result;
    apiTesting = false;
  }
</script>

<div class="settings-block">
  <div class="settings-block__title">🔌 Connexion API FootyStats</div>

  <div style="margin-bottom:16px;">
    {#if !$apiConnected}
      <div class="danger-box">⚠ Mode demonstration — API non configuree</div>
    {:else}
      <div class="info-box" style="border-color:var(--color-accent-green);color:var(--color-accent-green);">
        ✓ API connectee et operationnelle
      </div>
    {/if}
  </div>

  <div class="info-box" style="font-size:12px;margin-bottom:12px;">
    🔒 La cle API est stockee de facon securisee cote serveur (variable d'env Netlify).<br/>
    Elle n'est jamais exposee dans le navigateur.<br/><br/>
    <strong>Pour configurer ou changer la cle :</strong><br/>
    1. Netlify → votre site → <strong>Site configuration → Environment variables</strong><br/>
    2. Ajouter <code style="background:rgba(255,255,255,0.08);padding:1px 5px;border-radius:4px;">FOOTYSTATS_API_KEY</code> avec votre cle<br/>
    3. Redeployer le site (Deploy → Trigger deploy)
  </div>

  <button class="btn btn--secondary" onclick={handleTestApi} disabled={apiTesting}>
    {apiTesting ? '⏳ Test en cours...' : '🔗 Tester la connexion'}
  </button>

  {#if apiTestResult}
    <div class="api-test-result" class:success={apiTestResult.success} class:error={!apiTestResult.success}
      style="margin-top:8px;">
      {apiTestResult.success ? '✓ ' + apiTestResult.message : '✗ ' + apiTestResult.error}
    </div>
  {/if}
</div>
