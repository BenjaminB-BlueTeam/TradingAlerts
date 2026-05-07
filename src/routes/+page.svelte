<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/api/supabase.js';
  import { getDateStr } from '$lib/utils/formatters.js';
  import { apiConnected, leagues } from '$lib/stores/appStore.js';

  let alerts = $state([]);
  let loading = $state(true);
  let error = $state('');

  let seedLastDate = $state(null);
  let seedCount = $state(0);
  let seedLoading = $state(true);
  let seedError = $state('');

  let fhgAlerts = $derived(
    alerts.filter(a => ['FHG_A', 'FHG_B', 'FHG_A+B'].includes(a.signal_type) && !a.user_excluded)
  );

  let lg2Alerts = $derived(
    alerts.filter(a => ['LG2_A', 'LG2_B', 'LG2_A+B'].includes(a.signal_type) && !a.user_excluded)
  );

  let fhgFortToday = $derived(
    fhgAlerts.filter(a => a.confidence === 'fort' || a.confidence === 'fort_double')
  );

  let lg2FortToday = $derived(
    lg2Alerts.filter(a => a.confidence === 'fort' || a.confidence === 'fort_double')
  );

  let activeLeaguesCount = $derived($leagues.filter(l => l.active).length);
  let totalLeagues = $derived($leagues.length);

  let seedColorClass = $derived.by(() => {
    if (!seedLastDate) return 'red';
    const d1 = new Date();
    d1.setDate(d1.getDate() - 1);
    const yesterday = d1.toISOString().split('T')[0];
    const d2 = new Date();
    d2.setDate(d2.getDate() - 2);
    const dayBefore = d2.toISOString().split('T')[0];
    if (seedLastDate >= yesterday) return 'green';
    if (seedLastDate >= dayBefore) return 'orange';
    return 'red';
  });

  let seedDateLabel = $derived.by(() => {
    if (!seedLastDate) return '--';
    const [, m, day] = seedLastDate.split('-');
    return `${day}/${m}`;
  });

  let now = new Date();
  let dateLabel = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

  async function loadAlerts() {
    loading = true;
    error = '';
    const { data, error: dbError } = await supabase
      .from('alerts')
      .select('signal_type, confidence, user_excluded, match_date')
      .eq('match_date', getDateStr(0));
    if (dbError) {
      error = 'Impossible de charger les alertes.';
      alerts = [];
    } else {
      alerts = data || [];
    }
    loading = false;
  }

  async function loadSeedStatus() {
    seedLoading = true;
    seedError = '';
    const { count, data, error: dbError } = await supabase
      .from('h2h_matches')
      .select('match_date', { count: 'exact' })
      .order('match_date', { ascending: false })
      .limit(1);
    if (dbError) {
      seedError = 'Erreur seed';
      seedLoading = false;
      return;
    }
    seedCount = count ?? 0;
    seedLastDate = data && data.length > 0 ? data[0].match_date : null;
    seedLoading = false;
  }

  onMount(() => {
    loadAlerts();
    loadSeedStatus();
  });
</script>

<div class="dashboard-header">
  <div class="dashboard-header__left">
    <h1 class="page-title" style="margin-bottom:0;">Dashboard</h1>
    <div class="dashboard-header__date">{dateLabel}</div>
  </div>
</div>

<div class="metric-grid">

  <div class="metric-card" class:metric-card--ok={$apiConnected} class:metric-card--error={!$apiConnected}>
    <div class="metric-card__label">API FootyStats</div>
    <div class="metric-card__value" class:green={$apiConnected} class:red={!$apiConnected}>
      {$apiConnected ? 'OK' : 'KO'}
    </div>
    <div class="metric-card__sub">{$apiConnected ? 'Connectée' : 'Déconnectée'}</div>
  </div>

  <div class="metric-card">
    <div class="metric-card__label">Ligues FootyStats</div>
    <div class="metric-card__value blue">{totalLeagues}</div>
    <div class="metric-card__sub">{activeLeaguesCount} actives (filtre)</div>
  </div>

  <div class="metric-card">
    <div class="metric-card__label">FHG Fort — aujourd'hui</div>
    {#if loading}
      <div class="metric-card__value muted">—</div>
      <div class="metric-card__sub">&nbsp;</div>
    {:else}
      <div class="metric-card__value green">{fhgFortToday.length}</div>
      <div class="metric-card__sub">{fhgAlerts.length} FHG total</div>
    {/if}
  </div>

  <div class="metric-card">
    <div class="metric-card__label">LG2 Fort — aujourd'hui</div>
    {#if loading}
      <div class="metric-card__value muted">—</div>
      <div class="metric-card__sub">&nbsp;</div>
    {:else}
      <div class="metric-card__value blue">{lg2FortToday.length}</div>
      <div class="metric-card__sub">{lg2Alerts.length} LG2 total</div>
    {/if}
  </div>

  <div
    class="metric-card"
    class:metric-card--ok={seedColorClass === 'green'}
    class:metric-card--warn={seedColorClass === 'orange'}
    class:metric-card--error={seedColorClass === 'red'}
  >
    <div class="metric-card__label">Seed matchs</div>
    {#if seedLoading}
      <div class="metric-card__value muted">—</div>
      <div class="metric-card__sub">chargement…</div>
    {:else if seedError}
      <div class="metric-card__value red">!</div>
      <div class="metric-card__sub">{seedError}</div>
    {:else}
      <div
        class="metric-card__value"
        class:green={seedColorClass === 'green'}
        class:orange={seedColorClass === 'orange'}
        class:red={seedColorClass === 'red'}
      >
        {seedDateLabel}
      </div>
      <div class="metric-card__sub">{seedCount.toLocaleString('fr-FR')} matchs</div>
    {/if}
  </div>

</div>

{#if error}
  <p class="error-msg">{error}</p>
{/if}

<style>
  .dashboard-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
  .dashboard-header__date { font-size: 13px; color: var(--color-text-muted); margin-top: 2px; text-transform: capitalize; }

  .metric-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin-bottom: 24px; }
  .metric-card { background: var(--color-bg-card); border: 1px solid var(--color-border); border-radius: var(--radius-card); padding: 16px; text-align: center; }
  .metric-card__label { font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--color-text-muted); margin-bottom: 4px; }
  .metric-card__value { font-size: 28px; font-weight: 700; }
  .metric-card__value.green { color: var(--color-accent-green); }
  .metric-card__value.blue { color: var(--color-accent-blue); }
  .metric-card__value.orange { color: var(--color-signal-moyen); }
  .metric-card__value.red { color: var(--color-danger); }
  .metric-card__value.muted { color: var(--color-text-muted); }
  .metric-card__sub { font-size: 11px; color: var(--color-text-muted); margin-top: 2px; min-height: 16px; }
  .metric-card--ok { border-color: rgba(29,158,117,0.3); }
  .metric-card--warn { border-color: rgba(239,159,39,0.3); }
  .metric-card--error { border-color: rgba(226,75,74,0.3); }

  .error-msg { color: var(--color-danger); font-size: 13px; margin-top: 8px; }

  @media (max-width: 768px) {
    .metric-grid { grid-template-columns: repeat(2, 1fr); }
    .metric-grid .metric-card:first-child { grid-column: span 2; }
  }
</style>
