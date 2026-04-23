<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/api/supabase.js';
  import { applyFilters, aggregateByTeam, strategyOf } from '$lib/utils/historyFilters.js';

  import FiltersBar from '$lib/components/historique/FiltersBar.svelte';
  import ChartEvolution from '$lib/components/historique/ChartEvolution.svelte';
  import ChartStackedStrategy from '$lib/components/historique/ChartStackedStrategy.svelte';
  import ChartTopTeams from '$lib/components/historique/ChartTopTeams.svelte';
  import ChartTopLeagues from '$lib/components/historique/ChartTopLeagues.svelte';
  import MatchesTable from '$lib/components/historique/MatchesTable.svelte';
  import TradesVsGlobal from '$lib/components/historique/TradesVsGlobal.svelte';
  import WhatIfExclusions from '$lib/components/historique/WhatIfExclusions.svelte';

  // ---------- État global ----------
  let allAlerts = $state([]);
  let loading = $state(true);
  let error = $state('');
  let viewMode = $state('active'); // 'active' | 'excluded'

  // Filtres (par défaut : 90 derniers jours, statut terminées)
  function defaultDateFrom() {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    return d.toISOString().split('T')[0];
  }

  let filters = $state({
    dateFrom: defaultDateFrom(),
    dateTo: null,
    strategy: 'tous',
    confidence: 'tous',
    team: null,
    league: null,
    status: 'terminees',
    evolutionGranularity: 'jour',
  });

  // ---------- Chargement ----------
  async function loadAlerts() {
    loading = true;
    error = '';
    // On charge TOUT puis on filtre en mémoire (Option 1 du design).
    // Pour éviter un dump complet, on borne à "jamais plus vieux que 2 ans".
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
    const cutoff = twoYearsAgo.toISOString().split('T')[0];
    const { data, error: dbError } = await supabase
      .from('alerts')
      .select('*')
      .gte('match_date', cutoff)
      .order('kickoff_unix', { ascending: false });
    if (dbError) {
      console.error('historique loadAlerts:', dbError);
      error = 'Impossible de charger les alertes.';
      allAlerts = [];
    } else {
      allAlerts = data || [];
    }
    loading = false;
  }

  onMount(() => { loadAlerts(); });

  // ---------- Derived ----------
  let activeAlerts = $derived(allAlerts.filter(a => !a.user_excluded));
  let excludedAlerts = $derived(allAlerts.filter(a => a.user_excluded));

  let baseList = $derived(viewMode === 'excluded' ? excludedAlerts : activeAlerts);
  let filteredAlerts = $derived(applyFilters(baseList, filters));

  // Pour les graphiques : on veut VOIR les terminées même si filters.status='tous'
  // Donc on filtre sauf pour le statut, puis on ne garde que validated/lost dans les charts.
  let filtersForCharts = $derived({ ...filters, status: 'terminees' });
  let alertsForCharts = $derived(applyFilters(baseList, filtersForCharts));

  // Global pct (terminées actives, mêmes filtres sauf status)
  let globalPct = $derived((() => {
    if (!alertsForCharts.length) return null;
    const v = alertsForCharts.filter(a => a.status === 'validated').length;
    return Math.round(v / alertsForCharts.length * 100);
  })());

  // Dropdowns équipe/ligue : dérivés de baseList non filtrée pour équipe, des alertes filtrées par status pour ligue
  let availableLeagues = $derived([...new Set(baseList.map(a => a.league_name).filter(Boolean))].sort());
  let availableTeams = $derived(aggregateByTeam(baseList, { minMatches: 1, topN: 999 }));

  // KPI globaux (alertes filtrées terminées)
  let terminated = $derived(alertsForCharts);
  let validatedCount = $derived(terminated.filter(a => a.status === 'validated').length);
  let lostCount = $derived(terminated.filter(a => a.status === 'lost').length);
</script>

<div class="page-header">
  <div>
    <h1 class="page-title" style="margin-bottom:0;">📈 Historique</h1>
    <p class="page-subtitle" style="margin:4px 0 0;">
      {filteredAlerts.length} alerte{filteredAlerts.length > 1 ? 's' : ''} affichée{filteredAlerts.length > 1 ? 's' : ''}
      {#if globalPct !== null}
        · taux global <strong style:color={globalPct >= 65 ? 'var(--color-accent-green)' : globalPct >= 50 ? 'var(--color-signal-moyen)' : 'var(--color-danger)'}>{globalPct}%</strong>
        ({validatedCount}/{terminated.length})
      {/if}
    </p>
  </div>
  {#if excludedAlerts.length > 0}
    <button
      class="btn btn--ghost btn--sm"
      class:btn--active={viewMode === 'excluded'}
      onclick={() => viewMode = viewMode === 'excluded' ? 'active' : 'excluded'}
    >
      {viewMode === 'excluded' ? '← Alertes actives' : `Voir exclusions (${excludedAlerts.length})`}
    </button>
  {/if}
</div>

{#if loading}
  <div class="empty-state" style="padding:30px;">
    <div class="empty-state__icon">⏳</div>
    <div class="empty-state__title">Chargement...</div>
  </div>
{:else if error}
  <p class="error-msg">{error}</p>
{:else}

  <!-- FILTRES -->
  <FiltersBar
    bind:filters
    {availableTeams}
    {availableLeagues}
  />

  <!-- GRAPHIQUES 2x2 -->
  <div class="charts-grid">
    <ChartEvolution
      alerts={alertsForCharts}
      strategy={filters.strategy}
      bind:granularity={filters.evolutionGranularity}
    />
    <ChartStackedStrategy alerts={alertsForCharts} />
    <ChartTopTeams alerts={alertsForCharts} />
    <ChartTopLeagues alerts={alertsForCharts} />
  </div>

  <!-- TABLEAU -->
  <div class="section-heading">
    <h2>Matchs</h2>
    <span class="section-meta">{filteredAlerts.length} résultat{filteredAlerts.length > 1 ? 's' : ''}</span>
  </div>
  <MatchesTable alerts={filteredAlerts} />

  <!-- BLOCS ANNEXES -->
  {#if viewMode === 'active'}
    <TradesVsGlobal terminated={alertsForCharts} />
  {:else}
    <WhatIfExclusions excludedAlerts={excludedAlerts} {globalPct} />
  {/if}
{/if}

<style>
  .page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
    flex-wrap: wrap;
    gap: 8px;
  }
  .charts-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 14px;
    margin-bottom: 20px;
  }
  .section-heading {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin: 18px 0 10px;
  }
  .section-heading h2 {
    margin: 0;
    font-size: 14px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--color-text-primary);
  }
  .section-meta {
    font-size: 11px;
    color: var(--color-text-muted);
  }

  @media (max-width: 1024px) {
    .charts-grid { grid-template-columns: 1fr; }
  }
</style>
