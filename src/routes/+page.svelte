<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/api/supabase.js';
  import { getDateStr } from '$lib/utils/formatters.js';
  import { apiConnected, leagues } from '$lib/stores/appStore.js';

  let alerts = $state([]);
  let loading = $state(true);
  let error = $state('');

  let seedLastDate = $state(null);
  let seedLastTime = $state(null);
  let seedCount = $state(0);
  let seedLoading = $state(true);
  let seedError = $state('');

  let validated7j = $state(0);
  let lost7j = $state(0);
  let taux7jLoading = $state(true);

  // Santé crons
  let lastGenerateTs = $state(null);   // MAX(created_at) de alerts
  let lastCheckTs = $state(null);      // MAX(verified_at) de alerts validated/lost
  let pendingOld = $state(null);       // count pending + match_date < J-2
  let cronsLoading = $state(true);

  let fhgAlerts = $derived(
    alerts.filter(a => ['FHG_A', 'FHG_B', 'FHG_A+B'].includes(a.signal_type) && !a.user_excluded)
  );
  let lg2Alerts = $derived(
    alerts.filter(a => ['LG2_A', 'LG2_B', 'LG2_A+B'].includes(a.signal_type) && !a.user_excluded)
  );
  let fhgFortToday = $derived(
    fhgAlerts.filter(a => a.confidence === 'fort')
  );
  let lg2FortToday = $derived(
    lg2Alerts.filter(a => a.confidence === 'fort')
  );
  let totalLeagues = $derived($leagues.length);

  let seedColorClass = $derived.by(() => {
    if (!seedLastDate) return 'red';
    const d1 = new Date(); d1.setDate(d1.getDate() - 1);
    const d2 = new Date(); d2.setDate(d2.getDate() - 2);
    if (seedLastDate >= d1.toISOString().split('T')[0]) return 'green';
    if (seedLastDate >= d2.toISOString().split('T')[0]) return 'orange';
    return 'red';
  });
  let seedDateLabel = $derived.by(() => {
    if (!seedLastDate) return '--';
    const [, m, day] = seedLastDate.split('-');
    return `${day}/${m}`;
  });

  let taux7j = $derived.by(() => {
    const total = validated7j + lost7j;
    if (total === 0) return null;
    return Math.round(validated7j / total * 100);
  });

  // Helpers crons
  function hoursAgo(isoTs) {
    if (!isoTs) return null;
    return (Date.now() - new Date(isoTs).getTime()) / 3600000;
  }
  function hoursLabel(isoTs) {
    if (!isoTs) return '--';
    const h = hoursAgo(isoTs);
    if (h < 1) return `${Math.round(h * 60)}min`;
    if (h < 24) return `${Math.floor(h)}h`;
    const d = Math.floor(h / 24);
    return `${d}j`;
  }

  let generateColorClass = $derived.by(() => {
    const h = hoursAgo(lastGenerateTs);
    if (h === null) return 'red';
    if (h < 13) return 'green';
    if (h < 25) return 'orange';
    return 'red';
  });
  let checkColorClass = $derived.by(() => {
    const h = hoursAgo(lastCheckTs);
    if (h === null) return 'red';
    if (h < 2) return 'green';
    if (h < 4) return 'orange';
    return 'red';
  });
  let pendingOldColorClass = $derived(pendingOld === 0 ? 'green' : pendingOld === null ? 'red' : 'red');

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
    const today = new Date().toISOString().split('T')[0];
    const [dateRes, timeRes] = await Promise.all([
      supabase
        .from('h2h_matches')
        .select('match_date', { count: 'exact' })
        .lte('match_date', today)
        .order('match_date', { ascending: false })
        .limit(1),
      supabase
        .from('h2h_matches')
        .select('last_updated')
        .order('last_updated', { ascending: false })
        .limit(1)
    ]);
    if (dateRes.error) {
      seedError = 'Erreur seed';
      seedLoading = false;
      return;
    }
    seedCount = dateRes.count ?? 0;
    seedLastDate = dateRes.data && dateRes.data.length > 0 ? dateRes.data[0].match_date : null;
    if (timeRes.data && timeRes.data.length > 0 && timeRes.data[0].last_updated) {
      const d = new Date(timeRes.data[0].last_updated);
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      seedLastTime = `${hh}h${mm}`;
    }
    seedLoading = false;
  }

  async function loadTaux7j() {
    taux7jLoading = true;
    const d7 = new Date(); d7.setDate(d7.getDate() - 7);
    const { data, error: dbError } = await supabase
      .from('alerts')
      .select('status')
      .in('status', ['validated', 'lost'])
      .gte('match_date', d7.toISOString().split('T')[0]);
    if (!dbError && data) {
      validated7j = data.filter(a => a.status === 'validated').length;
      lost7j = data.filter(a => a.status === 'lost').length;
    }
    taux7jLoading = false;
  }

  async function loadCronHealth() {
    cronsLoading = true;
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 2);
    const cutoffStr = cutoff.toISOString().split('T')[0];

    const [genRes, checkRes, pendingRes] = await Promise.all([
      supabase.from('alerts').select('created_at').order('created_at', { ascending: false }).limit(1),
      supabase.from('alerts').select('verified_at').in('status', ['validated', 'lost']).order('verified_at', { ascending: false }).limit(1),
      supabase.from('alerts').select('id', { count: 'exact', head: true }).eq('status', 'pending').lt('match_date', cutoffStr),
    ]);

    if (!genRes.error && genRes.data?.length > 0) lastGenerateTs = genRes.data[0].created_at;
    if (!checkRes.error && checkRes.data?.length > 0) lastCheckTs = checkRes.data[0].verified_at;
    if (!pendingRes.error) pendingOld = pendingRes.count ?? 0;

    cronsLoading = false;
  }

  onMount(() => {
    loadAlerts();
    loadSeedStatus();
    loadTaux7j();
    loadCronHealth();
  });
</script>

<div class="dashboard-wrap">

  <div class="dashboard-header">
    <h1 class="page-title">Dashboard</h1>
    <div class="dashboard-header__date">{dateLabel}</div>
  </div>

  <div class="section-label">Santé infra</div>
  <div class="metric-grid metric-grid--3">

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
      <div class="metric-card__sub">retournées par l'API</div>
    </div>

    <div
      class="metric-card"
      class:metric-card--ok={seedColorClass === 'green'}
      class:metric-card--warn={seedColorClass === 'orange'}
      class:metric-card--error={seedColorClass === 'red'}
    >
      <div class="metric-card__label">Seed H2H</div>
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
        <div class="metric-card__sub">
          {seedCount.toLocaleString('fr-FR')} matchs{seedLastTime ? ` · ${seedLastTime}` : ''}
        </div>
      {/if}
    </div>

  </div>

  <div class="section-label">Santé crons</div>
  <div class="metric-grid metric-grid--3">

    <div
      class="metric-card"
      class:metric-card--ok={generateColorClass === 'green'}
      class:metric-card--warn={generateColorClass === 'orange'}
      class:metric-card--error={generateColorClass === 'red'}
    >
      <div class="metric-card__label">Génération alertes</div>
      {#if cronsLoading}
        <div class="metric-card__value muted">—</div>
        <div class="metric-card__sub">chargement…</div>
      {:else}
        <div
          class="metric-card__value"
          class:green={generateColorClass === 'green'}
          class:orange={generateColorClass === 'orange'}
          class:red={generateColorClass === 'red'}
        >
          {hoursLabel(lastGenerateTs)}
        </div>
        <div class="metric-card__sub">depuis le dernier run</div>
      {/if}
    </div>

    <div
      class="metric-card"
      class:metric-card--ok={checkColorClass === 'green'}
      class:metric-card--warn={checkColorClass === 'orange'}
      class:metric-card--error={checkColorClass === 'red'}
    >
      <div class="metric-card__label">Vérif. résultats</div>
      {#if cronsLoading}
        <div class="metric-card__value muted">—</div>
        <div class="metric-card__sub">chargement…</div>
      {:else}
        <div
          class="metric-card__value"
          class:green={checkColorClass === 'green'}
          class:orange={checkColorClass === 'orange'}
          class:red={checkColorClass === 'red'}
        >
          {hoursLabel(lastCheckTs)}
        </div>
        <div class="metric-card__sub">depuis la dernière vérif.</div>
      {/if}
    </div>

    <div
      class="metric-card"
      class:metric-card--ok={pendingOldColorClass === 'green'}
      class:metric-card--error={pendingOldColorClass === 'red'}
    >
      <div class="metric-card__label">Alertes bloquées</div>
      {#if cronsLoading}
        <div class="metric-card__value muted">—</div>
        <div class="metric-card__sub">chargement…</div>
      {:else}
        <div
          class="metric-card__value"
          class:green={pendingOldColorClass === 'green'}
          class:red={pendingOldColorClass === 'red'}
        >
          {pendingOld ?? '!'}
        </div>
        <div class="metric-card__sub">{pendingOld === 0 ? 'aucune en attente > 48h' : `pending sans résultat > 48h`}</div>
      {/if}
    </div>

  </div>

  <div class="section-label">Alertes du jour</div>
  <div class="metric-grid metric-grid--3">

    <a href="/alerts?day=0" class="metric-card metric-card--link">
      <div class="metric-card__label">FHG Fort — aujourd'hui</div>
      {#if loading}
        <div class="metric-card__value muted">—</div>
        <div class="metric-card__sub">&nbsp;</div>
      {:else}
        <div class="metric-card__value green">{fhgFortToday.length}</div>
        <div class="metric-card__sub">sur {fhgAlerts.length} alerte{fhgAlerts.length > 1 ? 's' : ''} FHG</div>
      {/if}
    </a>

    <a href="/alerts-lg2?day=0" class="metric-card metric-card--link">
      <div class="metric-card__label">LG2 Fort — aujourd'hui</div>
      {#if loading}
        <div class="metric-card__value muted">—</div>
        <div class="metric-card__sub">&nbsp;</div>
      {:else}
        <div class="metric-card__value blue">{lg2FortToday.length}</div>
        <div class="metric-card__sub">sur {lg2Alerts.length} alerte{lg2Alerts.length > 1 ? 's' : ''} LG2</div>
      {/if}
    </a>

    <div class="metric-card">
      <div class="metric-card__label">Taux validées (7j)</div>
      {#if taux7jLoading}
        <div class="metric-card__value muted">—</div>
        <div class="metric-card__sub">chargement…</div>
      {:else if taux7j === null}
        <div class="metric-card__value muted">—</div>
        <div class="metric-card__sub">aucune donnée</div>
      {:else}
        <div
          class="metric-card__value"
          class:green={taux7j >= 60}
          class:orange={taux7j >= 40 && taux7j < 60}
          class:red={taux7j < 40}
        >
          {taux7j}%
        </div>
        <div class="metric-card__sub">{validated7j}✓ / {lost7j}✗ matchs</div>
      {/if}
    </div>

  </div>

  {#if error}
    <p class="error-msg">{error}</p>
  {/if}

</div>

<style>
  .dashboard-wrap { max-width: 960px; margin: 0 auto; }

  .dashboard-header { margin-bottom: 28px; }
  .dashboard-header__date { font-size: 13px; color: var(--color-text-muted); margin-top: 2px; text-transform: capitalize; }

  .section-label {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--color-text-muted);
    margin-bottom: 8px;
  }

  .metric-grid { display: grid; gap: 12px; margin-bottom: 24px; }
  .metric-grid--3 { grid-template-columns: repeat(3, 1fr); }

  .metric-card {
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-card);
    padding: 20px 16px;
    text-align: center;
  }
  .metric-card__label {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--color-text-muted);
    margin-bottom: 8px;
  }
  .metric-card__value { font-size: 32px; font-weight: 700; line-height: 1; }
  .metric-card__value.green { color: var(--color-accent-green); }
  .metric-card__value.blue { color: var(--color-accent-blue); }
  .metric-card__value.orange { color: var(--color-signal-moyen); }
  .metric-card__value.red { color: var(--color-danger); }
  .metric-card__value.muted { color: var(--color-text-muted); }
  .metric-card__sub { font-size: 11px; color: var(--color-text-muted); margin-top: 6px; min-height: 16px; }

  .metric-card--link { text-decoration: none; color: inherit; display: block; cursor: pointer; }
  .metric-card--link:hover { border-color: var(--color-accent-blue); }
  .metric-card--ok { border-color: rgba(29,158,117,0.3); }
  .metric-card--warn { border-color: rgba(239,159,39,0.3); }
  .metric-card--error { border-color: rgba(226,75,74,0.3); }

  .error-msg { color: var(--color-danger); font-size: 13px; margin-top: 8px; }

  @media (max-width: 900px) {
    .metric-grid--3 { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 500px) {
    .metric-grid--3 { grid-template-columns: 1fr; }
  }
</style>
