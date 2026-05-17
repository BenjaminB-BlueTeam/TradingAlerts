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

  // Santé crons — definition des 5 crons (source de verite = function-level exports.config)
  /**
   * @type {Array<{
   *   name: string, label: string,
   *   hoursUTC: number[] | null,   // null = recurrent (toutes les X min)
   *   intervalMin?: number,        // pour les crons recurrents (pre-kickoff)
   *   freqHours: number,           // periode nominale en heures pour seuils color
   *   notes: string,
   * }>}
   */
  const CRONS = [
    { name: 'daily-seed',           label: 'Seed quotidien',     hoursUTC: [4],     freqHours: 24, notes: '6h Paris · matchs hier' },
    { name: 'compute-team-lg1',     label: 'Calcul LG1% / LG2%', hoursUTC: [5],     freqHours: 24, notes: '7h Paris · badges equipes' },
    { name: 'generate-alerts',      label: 'Generation alertes', hoursUTC: [6, 16], freqHours: 12, notes: '8h + 18h Paris' },
    { name: 'notify-daily-summary', label: 'Resume Telegram',    hoursUTC: [9],     freqHours: 24, notes: '11h Paris · alertes Fort' },
    { name: 'notify-pre-kickoff',   label: 'Telegram pre-match', hoursUTC: null, intervalMin: 5, freqHours: 0.1, notes: 'toutes les 5 min' },
  ];

  /** @type {Map<string, {started_at: string, status: string}>} */
  let cronLastRuns = $state(new Map());
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

  // Icone de statut (case a cocher visuelle) selon le status du dernier run
  function statusIcon(status) {
    if (status === 'success') return '✓';
    if (status === 'error') return '✗';
    if (status === 'running') return '…';
    return '—';
  }
  function statusClass(status) {
    if (status === 'success') return 'status-ok';
    if (status === 'error') return 'status-ko';
    if (status === 'running') return 'status-running';
    return 'status-none';
  }

  let now = $state(new Date());
  let dateLabel = $derived(now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }));

  $effect(() => {
    const t = setInterval(() => { now = new Date(); }, 60000);
    return () => clearInterval(t);
  });

  function nextCronRun(cron) {
    if (cron.hoursUTC == null && cron.intervalMin) {
      // Cron recurrent : prochain pas de N minutes
      const d = new Date(now);
      const m = d.getUTCMinutes();
      const next = Math.ceil((m + 1) / cron.intervalMin) * cron.intervalMin;
      d.setUTCMinutes(next, 0, 0);
      return d;
    }
    const candidates = [];
    for (let day = 0; day <= 1; day++) {
      for (const h of cron.hoursUTC) {
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
    const results = await Promise.all(
      CRONS.map(c =>
        supabase.from('cron_runs')
          .select('started_at, status')
          .eq('cron_name', c.name)
          .order('started_at', { ascending: false })
          .limit(1)
      )
    );
    const m = new Map();
    results.forEach((res, i) => {
      if (!res.error && res.data?.length > 0) {
        m.set(CRONS[i].name, res.data[0]);
      }
    });
    cronLastRuns = m;
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

    {#each CRONS as cron (cron.name)}
      {@const last = cronLastRuns.get(cron.name)}
      {@const lastTs = last?.started_at ?? null}
      {@const lastStatus = last?.status ?? null}
      {@const colorClass = cronColorClass(lastTs, cron.freqHours)}
      <div
        class="metric-card cron-card"
        class:metric-card--ok={colorClass === 'green'}
        class:metric-card--warn={colorClass === 'orange'}
        class:metric-card--error={colorClass === 'red'}
      >
        <div class="cron-card__head">
          <div class="metric-card__label">{cron.label}</div>
          <span class="cron-status {statusClass(lastStatus)}" title="Statut du dernier run : {lastStatus ?? 'aucun run'}">
            {statusIcon(lastStatus)}
          </span>
        </div>
        {#if cronsLoading}
          <div class="metric-card__value muted">—</div>
          <div class="metric-card__sub">chargement…</div>
        {:else}
          <div
            class="metric-card__value"
            class:green={colorClass === 'green'}
            class:orange={colorClass === 'orange'}
            class:red={colorClass === 'red'}
          >
            {lastRunLabel(lastTs)}
          </div>
          <div class="metric-card__sub">{lastTs ? `il y a ${hoursLabel(lastTs)} · ${cron.notes}` : `jamais · ${cron.notes}`}</div>
          <div class="next-run">Prochain : {formatCountdown(nextCronRun(cron))}</div>
        {/if}
      </div>
    {/each}

  </div>

  <div class="section-label">Alertes du jour</div>
  <div class="metric-grid metric-grid--2">

    <a href="/alerts/lg1?day=0" class="metric-card metric-card--link">
      <div class="metric-card__label">LG1 Fort — aujourd'hui</div>
      {#if loading}
        <div class="metric-card__value muted">—</div>
        <div class="metric-card__sub">&nbsp;</div>
      {:else}
        <div class="metric-card__value green">{lg1FortToday.length}</div>
        <div class="metric-card__sub">sur {lg1Alerts.length} alerte{lg1Alerts.length > 1 ? 's' : ''} LG1</div>
      {/if}
    </a>

    <a href="/alerts/lg2?day=0" class="metric-card metric-card--link">
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

  /* Cron card : status icon en haut a droite */
  .cron-card { position: relative; padding-top: 24px; }
  .cron-card__head {
    position: absolute;
    top: 10px;
    left: 12px;
    right: 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }
  .cron-card .metric-card__label { margin-bottom: 0; text-align: left; flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cron-status {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 700;
    line-height: 1;
    flex-shrink: 0;
    border: 1px solid;
  }
  .cron-status.status-ok    { background: rgba(29,158,117,0.18);  color: var(--color-accent-green); border-color: rgba(29,158,117,0.4); }
  .cron-status.status-ko    { background: rgba(226,75,74,0.15);   color: var(--color-danger);       border-color: rgba(226,75,74,0.4); }
  .cron-status.status-running { background: rgba(239,159,39,0.15); color: var(--color-signal-moyen); border-color: rgba(239,159,39,0.4); }
  .cron-status.status-none  { background: rgba(160,163,177,0.10); color: var(--color-text-muted);   border-color: rgba(160,163,177,0.25); }

  @media (max-width: 900px) {
    .metric-grid--3 { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 500px) {
    .metric-grid--3 { grid-template-columns: 1fr; }
  }
</style>
