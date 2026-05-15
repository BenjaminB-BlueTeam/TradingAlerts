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

  // Santé crons
  let lastGenerateTs = $state(null);  // dernier started_at de generate-alerts (cron_runs)
  let lastSeedTs = $state(null);      // dernier started_at de daily-seed (cron_runs)
  let lastComputeTs = $state(null);   // dernier started_at de compute-team-lg1 (cron_runs)
  let cronsLoading = $state(true);

  let lg1Alerts = $derived(
    alerts.filter(a => ['LG1_A', 'LG1_B', 'LG1_A+B', 'LG1_C', 'LG1_D'].includes(a.signal_type) && !a.user_excluded)
  );
  let lg2Alerts = $derived(
    alerts.filter(a => ['LG2_A', 'LG2_B', 'LG2_A+B'].includes(a.signal_type) && !a.user_excluded)
  );
  let lg1FortToday = $derived(
    lg1Alerts.filter(a => a.confidence === 'fort')
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

  // Heure du dernier passage du cron. Format compact mobile :
  //   - aujourd'hui   → "12:34"
  //   - hier          → "hier 12:34"
  //   - plus ancien   → "08/05 12:34"
  function lastRunLabel(isoTs) {
    if (!isoTs) return '--';
    const d = new Date(isoTs);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const time = `${hh}:${mm}`;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
    const dDay = new Date(d); dDay.setHours(0, 0, 0, 0);
    if (dDay.getTime() === today.getTime()) return time;
    if (dDay.getTime() === yesterday.getTime()) return `hier ${time}`;
    const day = String(d.getDate()).padStart(2, '0');
    const mon = String(d.getMonth() + 1).padStart(2, '0');
    return `${day}/${mon} ${time}`;
  }

  // freqHours = fréquence nominale du cron. Seuils : green < freq+1h, orange < 2*freq+1h, red sinon.
  function cronColorClass(isoTs, freqHours) {
    const h = hoursAgo(isoTs);
    if (h === null) return 'red';
    if (h < freqHours + 1) return 'green';
    if (h < 2 * freqHours + 1) return 'orange';
    return 'red';
  }
  let generateColorClass = $derived(cronColorClass(lastGenerateTs, 12));
  let seedColorClass2 = $derived(cronColorClass(lastSeedTs, 24));
  let computeColorClass = $derived(cronColorClass(lastComputeTs, 24));

  let now = $state(new Date());
  let dateLabel = $derived(now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }));

  $effect(() => {
    const t = setInterval(() => { now = new Date(); }, 60000);
    return () => clearInterval(t);
  });

  function nextCronRun(hours) {
    const candidates = [];
    for (let day = 0; day <= 1; day++) {
      for (const h of hours) {
        const d = new Date(now);
        d.setUTCDate(d.getUTCDate() + day);
        d.setUTCHours(h, 0, 0, 0);
        if (d > now) candidates.push(d);
      }
    }
    return candidates.sort((a, b) => a - b)[0] || null;
  }

  function formatCountdown(target) {
    if (!target) return '--';
    const totalMin = Math.floor((target - now) / 60000);
    if (totalMin <= 0) return 'maintenant';
    const h = Math.floor(totalMin / 60);
    const min = totalMin % 60;
    if (h >= 24) { const d = Math.floor(h / 24), rh = h % 24; return rh > 0 ? `dans ${d}j ${rh}h` : `dans ${d}j`; }
    if (h > 0) return min > 0 ? `dans ${h}h ${min}min` : `dans ${h}h`;
    return `dans ${min}min`;
  }

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

  async function loadCronHealth() {
    cronsLoading = true;
    const [generateRes, seedRes, computeRes] = await Promise.all([
      supabase.from('cron_runs').select('started_at, status').eq('cron_name', 'generate-alerts').order('started_at', { ascending: false }).limit(1),
      supabase.from('cron_runs').select('started_at, status').eq('cron_name', 'daily-seed').order('started_at', { ascending: false }).limit(1),
      supabase.from('cron_runs').select('started_at, status').eq('cron_name', 'compute-team-lg1').order('started_at', { ascending: false }).limit(1),
    ]);

    if (!generateRes.error && generateRes.data?.length > 0) lastGenerateTs = generateRes.data[0].started_at;
    if (!seedRes.error && seedRes.data?.length > 0) lastSeedTs = seedRes.data[0].started_at;
    if (!computeRes.error && computeRes.data?.length > 0) lastComputeTs = computeRes.data[0].started_at;

    cronsLoading = false;
  }

  onMount(() => {
    loadAlerts();
    loadSeedStatus();
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
      <div class="metric-card__sub">{$apiConnected ? 'API accessible' : 'API inaccessible'}</div>
    </div>

    <div class="metric-card">
      <div class="metric-card__label">Ligues actives</div>
      <div class="metric-card__value blue">{totalLeagues}</div>
      <div class="metric-card__sub">sélectionnées FootyStats</div>
    </div>

    <div
      class="metric-card"
      class:metric-card--ok={seedColorClass === 'green'}
      class:metric-card--warn={seedColorClass === 'orange'}
      class:metric-card--error={seedColorClass === 'red'}
    >
      <div class="metric-card__label">Historique H2H</div>
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
          {seedCount.toLocaleString('fr-FR')}
        </div>
        <div class="metric-card__sub">
          matchs analysés par l'algo · dernier seed : {seedDateLabel}{seedLastTime ? ` à ${seedLastTime}` : ''}
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
          {lastRunLabel(lastGenerateTs)}
        </div>
        <div class="metric-card__sub">{lastGenerateTs ? `il y a ${hoursLabel(lastGenerateTs)} · cron 12h` : 'jamais · cron 12h'}</div>
        <div class="next-run">Prochain : {formatCountdown(nextCronRun([0, 12]))}</div>
      {/if}
    </div>

    <div
      class="metric-card"
      class:metric-card--ok={seedColorClass2 === 'green'}
      class:metric-card--warn={seedColorClass2 === 'orange'}
      class:metric-card--error={seedColorClass2 === 'red'}
    >
      <div class="metric-card__label">Seed quotidien</div>
      {#if cronsLoading}
        <div class="metric-card__value muted">—</div>
        <div class="metric-card__sub">chargement…</div>
      {:else}
        <div
          class="metric-card__value"
          class:green={seedColorClass2 === 'green'}
          class:orange={seedColorClass2 === 'orange'}
          class:red={seedColorClass2 === 'red'}
        >
          {lastRunLabel(lastSeedTs)}
        </div>
        <div class="metric-card__sub">{lastSeedTs ? `il y a ${hoursLabel(lastSeedTs)} · cron 24h` : 'jamais · cron 24h'}</div>
        <div class="next-run">Prochain : {formatCountdown(nextCronRun([6]))}</div>
      {/if}
    </div>

    <div
      class="metric-card"
      class:metric-card--ok={computeColorClass === 'green'}
      class:metric-card--warn={computeColorClass === 'orange'}
      class:metric-card--error={computeColorClass === 'red'}
    >
      <div class="metric-card__label">Calcul LG1%</div>
      {#if cronsLoading}
        <div class="metric-card__value muted">—</div>
        <div class="metric-card__sub">chargement…</div>
      {:else}
        <div
          class="metric-card__value"
          class:green={computeColorClass === 'green'}
          class:orange={computeColorClass === 'orange'}
          class:red={computeColorClass === 'red'}
        >
          {lastRunLabel(lastComputeTs)}
        </div>
        <div class="metric-card__sub">{lastComputeTs ? `il y a ${hoursLabel(lastComputeTs)} · cron 24h` : 'jamais · cron 24h'}</div>
        <div class="next-run">Prochain : {formatCountdown(nextCronRun([7]))}</div>
      {/if}
    </div>

  </div>

  <div class="section-label">Alertes du jour</div>
  <div class="metric-grid metric-grid--2">

    <a href="/alerts-lg1?day=0" class="metric-card metric-card--link">
      <div class="metric-card__label">LG1 Fort — aujourd'hui</div>
      {#if loading}
        <div class="metric-card__value muted">—</div>
        <div class="metric-card__sub">&nbsp;</div>
      {:else}
        <div class="metric-card__value green">{lg1FortToday.length}</div>
        <div class="metric-card__sub">sur {lg1Alerts.length} alerte{lg1Alerts.length > 1 ? 's' : ''} LG1</div>
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
  .metric-grid--2 { grid-template-columns: repeat(2, 1fr); }
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

  .next-run { font-size: 11px; color: var(--color-text-muted); margin-top: 2px; display: block; }
  .error-msg { color: var(--color-danger); font-size: 13px; margin-top: 8px; }

  @media (max-width: 900px) {
    .metric-grid--3 { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 500px) {
    .metric-grid--3 { grid-template-columns: 1fr; }
  }
</style>
