<script>
  import { onMount } from 'svelte';
  import { testApiConnection, rawApiCall, normalizeLeagues } from '$lib/api/footystats.js';
  import { testSupabaseConnection, getTableCounts } from '$lib/api/supabase.js';
  import { cacheStats, cacheClear } from '$lib/api/cache.js';
  import { startFullSeed, seedLeague, getSeedStatus } from '$lib/api/seedClient.js';

  // --- API Test ---
  let apiResult = $state(null);
  let apiTesting = $state(false);

  async function handleTestApi() {
    apiTesting = true;
    apiResult = null;
    const start = performance.now();
    apiResult = await testApiConnection();
    apiResult.elapsed = Math.round(performance.now() - start);
    apiTesting = false;
  }

  // --- Supabase Test ---
  let supaResult = $state(null);
  let supaTesting = $state(false);
  let tableCounts = $state(null);

  async function handleTestSupabase() {
    supaTesting = true;
    supaResult = null;
    tableCounts = null;
    supaResult = await testSupabaseConnection();
    if (supaResult.success) {
      tableCounts = await getTableCounts();
    }
    supaTesting = false;
  }

  // --- Cache ---
  let cache = $state({ total: 0, expired: 0, active: 0 });

  function refreshCache() {
    cache = cacheStats();
  }

  function handleClearCache() {
    cacheClear();
    refreshCache();
    if (window.showToast) window.showToast('Cache vide', 'success');
  }

  // --- Seed ---
  let seedJobId = $state(null);
  let seedLeagues = $state([]);
  let seedProgress = $state({});
  let seedRunning = $state(false);
  let seedCurrentLeague = $state('');
  let seedDone = $state(0);
  let seedTotal = $state(0);

  async function handleStartSeed() {
    seedRunning = true;
    seedProgress = {};
    seedDone = 0;
    try {
      const res = await startFullSeed();
      if (res.error) {
        if (window.showToast) window.showToast(res.error, 'error');
        seedRunning = false;
        return;
      }
      seedJobId = res.job_id;
      seedLeagues = res.leagues || [];
      seedTotal = seedLeagues.length;

      for (const league of seedLeagues) {
        const seasonIds = league.season_ids || [league.id];
        seedCurrentLeague = `${league.name || league.id}`;
        seedProgress[league.id] = `0/${seasonIds.length} saisons...`;
        seedProgress = seedProgress;

        let totalMatches = 0, totalErrors = 0;

        // Seeder une saison à la fois pour éviter le timeout Netlify
        for (let s = 0; s < seasonIds.length; s++) {
          seedProgress[league.id] = `saison ${s + 1}/${seasonIds.length}...`;
          seedProgress = seedProgress;
          try {
            const result = await seedLeague(String(seasonIds[s]), seedJobId);
            totalMatches += result.matches || 0;
            totalErrors += result.errors?.length || 0;
          } catch (e) {
            totalErrors++;
          }
          // Pause 1s entre chaque saison
          if (s < seasonIds.length - 1) {
            await new Promise(r => setTimeout(r, 1000));
          }
        }

        seedProgress[league.id] = `${totalMatches} matchs (${seasonIds.length} saisons)`;
        if (totalErrors > 0) seedProgress[league.id] += ` (${totalErrors} erreurs)`;
        seedDone++;
        seedProgress = seedProgress;

        // Pause 2s entre chaque ligue
        if (seedDone < seedTotal) {
          await new Promise(r => setTimeout(r, 2000));
        }
      }

      seedCurrentLeague = '';
      if (window.showToast) window.showToast(`Seed termine : ${seedDone}/${seedTotal} ligues`, 'success');
    } catch (e) {
      if (window.showToast) window.showToast(`Erreur seed : ${e.message}`, 'error');
    }
    seedRunning = false;
  }

  async function handleSeedSingle(leagueId, leagueName) {
    seedProgress[leagueId] = 'en cours...';
    seedProgress = seedProgress;
    try {
      const result = await seedLeague(leagueId, seedJobId || 0);
      seedProgress[leagueId] = `${result.teams || 0} equipes, ${result.matches || 0} matchs`;
      if (result.errors?.length) {
        seedProgress[leagueId] += ` (${result.errors.length} erreurs)`;
      }
      if (window.showToast) window.showToast(`${leagueName} seede`, 'success');
    } catch (e) {
      seedProgress[leagueId] = `erreur: ${e.message}`;
      if (window.showToast) window.showToast(e.message, 'error');
    }
    seedProgress = seedProgress;
  }

  // --- Testeur API brut ---
  let copyLabel = $state('📋 Copier');

  async function copyRawResult() {
    if (!rawResult) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(rawResult.data, null, 2));
      copyLabel = '✓ Copie !';
      setTimeout(() => copyLabel = '📋 Copier', 2000);
    } catch {
      copyLabel = '✗ Erreur';
      setTimeout(() => copyLabel = '📋 Copier', 2000);
    }
  }

  let rawEndpoint = $state('league-list');
  let rawParams = $state('');
  let rawResult = $state(null);
  let rawLoading = $state(false);

  const endpoints = [
    'league-list',
    'country-list',
    'league-teams',
    'league-matches',
    'league-tables',
    'league-season',
    'todays-matches',
    'match',
    'team',
    'lastx',
  ];

  async function handleRawCall() {
    rawLoading = true;
    rawResult = null;
    try {
      const params = {};
      if (rawParams.trim()) {
        rawParams.split('&').forEach(p => {
          const [k, v] = p.split('=');
          if (k) params[k.trim()] = (v || '').trim();
        });
      }
      rawResult = await rawApiCall(rawEndpoint, params);
    } catch (e) {
      rawResult = { error: e.message, status: 0, elapsed: 0 };
    }
    rawLoading = false;
  }

  // --- Seed leagues list (for single-seed buttons) ---
  let availableLeagues = $state([]);
  let leagueSearch = $state('');

  async function loadLeaguesList() {
    try {
      const res = await rawApiCall('league-list', { chosen_leagues_only: 'true' });
      availableLeagues = normalizeLeagues(res.data);
    } catch {
      availableLeagues = [];
    }
  }

  let filteredSeedLeagues = $derived(leagueSearch
    ? availableLeagues.filter(l =>
        (l.name || '').toLowerCase().includes(leagueSearch.toLowerCase()) ||
        (l.country || '').toLowerCase().includes(leagueSearch.toLowerCase())
      )
    : availableLeagues.slice(0, 30));

  onMount(() => {
    refreshCache();
    loadLeaguesList();
  });
</script>

<div class="page-title">🐛 Debug</div>
<div class="page-subtitle">Outils de diagnostic, seed et test API</div>

<!-- TEST API FOOTYSTATS -->
<div class="settings-block">
  <div class="settings-block__title">🔌 Test API FootyStats</div>
  <button class="btn btn--secondary" on:click={handleTestApi} disabled={apiTesting}>
    {apiTesting ? '⏳ Test...' : '🔗 Tester API'}
  </button>
  {#if apiResult}
    <div class="debug-result" class:success={apiResult.success} class:error={!apiResult.success}>
      {apiResult.success ? '✓ ' + apiResult.message : '✗ ' + apiResult.error}
      {#if apiResult.elapsed} — {apiResult.elapsed}ms{/if}
    </div>
  {/if}
</div>

<!-- TEST SUPABASE -->
<div class="settings-block">
  <div class="settings-block__title">🗄 Test Supabase</div>
  <button class="btn btn--secondary" on:click={handleTestSupabase} disabled={supaTesting}>
    {supaTesting ? '⏳ Test...' : '🔗 Tester Supabase'}
  </button>
  {#if supaResult}
    <div class="debug-result" class:success={supaResult.success} class:error={!supaResult.success}>
      {supaResult.success ? '✓ ' + supaResult.message : '✗ ' + supaResult.error}
    </div>
  {/if}
  {#if tableCounts}
    <div class="debug-table-counts">
      {#each Object.entries(tableCounts) as [table, count]}
        <div class="debug-count-row">
          <span class="debug-count-label">{table}</span>
          <span class="debug-count-value">{count}</span>
        </div>
      {/each}
    </div>
  {/if}
</div>

<!-- STATS CACHE -->
<div class="settings-block">
  <div class="settings-block__title">💾 Cache localStorage</div>
  <div class="debug-cache-stats">
    <span>Total : <strong>{cache.total}</strong></span>
    <span>Actifs : <strong>{cache.active}</strong></span>
    <span>Expires : <strong>{cache.expired}</strong></span>
  </div>
  <div style="display:flex;gap:8px;margin-top:8px;">
    <button class="btn btn--secondary btn--sm" on:click={refreshCache}>🔄 Rafraichir</button>
    <button class="btn btn--danger btn--sm" on:click={handleClearCache}>🗑 Vider cache</button>
  </div>
</div>

<!-- SEED DATA -->
<div class="settings-block">
  <div class="settings-block__title">🌱 Seed Data (FootyStats → Supabase)</div>

  <button class="btn btn--primary mb-16" on:click={handleStartSeed} disabled={seedRunning}>
    {seedRunning ? `⏳ Seed en cours (${seedDone}/${seedTotal})...` : '🚀 Seed complet (toutes les ligues)'}
  </button>

  {#if seedCurrentLeague}
    <div class="info-box mb-16">
      En cours : <strong>{seedCurrentLeague}</strong> ({seedDone}/{seedTotal})
    </div>
  {/if}

  {#if Object.keys(seedProgress).length > 0}
    <div class="debug-seed-progress">
      {#each Object.entries(seedProgress) as [id, status]}
        <div class="debug-seed-row">
          <span class="debug-seed-id">#{id}</span>
          <span class="debug-seed-status"
            class:done={typeof status === 'string' && status.includes('equipes')}
            class:error={typeof status === 'string' && status.includes('erreur')}
            class:pending={typeof status === 'string' && status.includes('cours')}
          >{status}</span>
        </div>
      {/each}
    </div>
  {/if}

  <!-- Seed ligue unique -->
  <div style="margin-top:16px;">
    <div style="font-size:13px;font-weight:500;margin-bottom:8px;">Seed une ligue unique :</div>
    <input type="text" class="form-input" style="margin-bottom:8px;"
      placeholder="Rechercher une ligue..." bind:value={leagueSearch} />
    <div class="debug-league-list">
      {#each filteredSeedLeagues as league (league.id)}
        <div class="debug-league-row">
          <span>{league.name} <span style="color:var(--color-text-muted);font-size:11px;">{league.country}</span></span>
          <button class="btn btn--secondary btn--sm"
            disabled={seedRunning}
            on:click={() => handleSeedSingle(league.id, league.name)}>
            Seed
          </button>
          {#if seedProgress[league.id]}
            <span class="debug-seed-inline">{seedProgress[league.id]}</span>
          {/if}
        </div>
      {/each}
      {#if availableLeagues.length === 0}
        <div style="color:var(--color-text-muted);font-size:12px;padding:8px;">
          Chargement des ligues... (l'API doit etre connectee)
        </div>
      {/if}
    </div>
  </div>
</div>

<!-- TESTEUR API BRUT -->
<div class="settings-block">
  <div class="settings-block__title">🧪 Testeur API brut</div>
  <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;margin-bottom:12px;">
    <div class="form-group" style="margin-bottom:0;">
      <label class="form-label">Endpoint</label>
      <select class="form-input" bind:value={rawEndpoint} style="width:180px;">
        {#each endpoints as ep}
          <option value={ep}>{ep}</option>
        {/each}
      </select>
    </div>
    <div class="form-group" style="margin-bottom:0;flex:1;min-width:200px;">
      <label class="form-label">Params (key=value&key2=value2)</label>
      <input type="text" class="form-input" bind:value={rawParams}
        placeholder="league_id=82&season=2024" />
    </div>
    <button class="btn btn--primary" on:click={handleRawCall} disabled={rawLoading}>
      {rawLoading ? '⏳...' : '▶ Executer'}
    </button>
  </div>
  {#if rawResult}
    <div class="debug-raw-meta">
      Status: <strong>{rawResult.status}</strong> — Temps: <strong>{rawResult.elapsed}ms</strong>
      <button class="btn-copy" on:click={copyRawResult} title="Copier le JSON">
        {copyLabel}
      </button>
    </div>
    <pre class="debug-raw-output">{JSON.stringify(rawResult.data, null, 2)}</pre>
  {/if}
</div>

<style>
  .debug-result {
    margin-top: 8px;
    padding: 8px 12px;
    border-radius: 8px;
    font-size: 13px;
  }
  .debug-result.success {
    background: rgba(29, 158, 117, 0.12);
    color: var(--color-accent-green);
  }
  .debug-result.error {
    background: rgba(226, 75, 74, 0.12);
    color: var(--color-danger);
  }
  .debug-table-counts {
    margin-top: 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .debug-count-row {
    display: flex;
    justify-content: space-between;
    padding: 6px 10px;
    background: rgba(255,255,255,0.03);
    border-radius: 6px;
    font-size: 13px;
  }
  .debug-count-label { color: var(--color-text-muted); }
  .debug-count-value { font-weight: 600; }
  .debug-cache-stats {
    display: flex;
    gap: 16px;
    font-size: 13px;
    padding: 8px 0;
  }
  .debug-seed-progress {
    display: flex;
    flex-direction: column;
    gap: 3px;
    max-height: 300px;
    overflow-y: auto;
    margin-top: 8px;
  }
  .debug-seed-row {
    display: flex;
    gap: 8px;
    align-items: center;
    padding: 4px 8px;
    background: rgba(255,255,255,0.03);
    border-radius: 6px;
    font-size: 12px;
  }
  .debug-seed-id {
    color: var(--color-text-muted);
    min-width: 60px;
  }
  .debug-seed-status.done { color: var(--color-accent-green); }
  .debug-seed-status.error { color: var(--color-danger); }
  .debug-seed-status.pending { color: var(--color-accent-blue); }
  .debug-league-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-height: 300px;
    overflow-y: auto;
  }
  .debug-league-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    background: rgba(255,255,255,0.03);
    border-radius: 6px;
    font-size: 13px;
  }
  .debug-league-row span:first-child { flex: 1; }
  .debug-seed-inline {
    font-size: 11px;
    color: var(--color-text-muted);
  }
  .debug-raw-meta {
    font-size: 13px;
    margin-bottom: 8px;
    color: var(--color-text-muted);
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .btn-copy {
    background: rgba(255,255,255,0.08);
    border: 1px solid var(--color-border);
    border-radius: 6px;
    padding: 3px 10px;
    font-size: 12px;
    color: var(--color-text-primary);
    cursor: pointer;
    transition: background 0.15s;
  }
  .btn-copy:hover {
    background: rgba(255,255,255,0.15);
  }
  .debug-raw-output {
    background: rgba(0,0,0,0.3);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    padding: 12px;
    font-size: 11px;
    max-height: 400px;
    overflow: auto;
    white-space: pre-wrap;
    word-break: break-all;
    color: var(--color-text-primary);
  }
</style>
