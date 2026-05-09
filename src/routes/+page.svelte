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
  let lastGenerateTs = $state(null);  // dernier started_at de generate-alerts (cron_runs)
  let lastCheckTs = $state(null);     // dernier started_at de check-results (cron_runs)
  let lastSeedTs = $state(null);      // dernier started_at de daily-seed (cron_runs)
  let lastComputeTs = $state(null);   // dernier started_at de compute-team-lg1 (cron_runs)
  let pendingOld = $state(null);      // count pending + match_date < J-2
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
  let checkColorClass = $derived(cronColorClass(lastCheckTs, 1));
  let seedColorClass2 = $derived(cronColorClass(lastSeedTs, 24));
  let computeColorClass = $derived(cronColorClass(lastComputeTs, 24));
  let pendingOldColorClass = $derived(pendingOld === 0 ? 'green' : 'red');

  // Performances personnelles
  let perfLoading = $state(true);
  let pnlWeek = $state(null);
  let pnlMonth = $state(null);
  let matchesMonth = $state(null);
  let tradesWeekCount = $state(0);
  let tradesWeekValid = $state(0);
  let tradesWeekLost = $state(0);
  let tradesMonthCount = $state(0);
  let tradesMonthValid = $state(0);
  let tradesMonthLost = $state(0);

  async function loadPerformances() {
    perfLoading = true;
    const now2 = new Date();

    // Format date locale (évite le décalage UTC à 00h-02h Paris)
    const pad = n => String(n).padStart(2, '0');
    const toLocalDateStr = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    // lundi 00:00 de la semaine courante
    const dow = (now2.getDay() + 6) % 7; // lundi=0 … dimanche=6
    const weekStart = new Date(now2);
    weekStart.setDate(weekStart.getDate() - dow);
    weekStart.setHours(0, 0, 0, 0);
    const weekStartStr = toLocalDateStr(weekStart);

    // 1er du mois courant 00:00
    const monthStart = new Date(now2.getFullYear(), now2.getMonth(), 1);
    const monthStartStr = toLocalDateStr(monthStart);

    const [tradesRes, alertsRes, selectedRes] = await Promise.all([
      supabase.from('alert_trades').select('match_id, signal_type, cote, mise'),
      supabase.from('alerts').select('match_id, signal_type, status, match_date').gte('match_date', monthStartStr),
      supabase.from('selected_alerts').select('match_id'),
    ]);

    if (tradesRes.error || alertsRes.error || selectedRes.error) {
      perfLoading = false;
      return;
    }

    // Normalisation match_id : alerts.match_id est bigint (number),
    // alert_trades.match_id et selected_alerts.match_id sont TEXT (string).
    // On force tout en string pour que Map/Set fonctionnent.
    const alertMap = new Map();
    for (const a of (alertsRes.data || [])) {
      alertMap.set(`${a.match_id}__${a.signal_type}`, a);
    }

    // Calcul P&L semaine et mois
    let sumWeek = 0, sumMonth = 0;
    let cntWeek = 0, cntMonth = 0;
    let validWeek = 0, lostWeek = 0, validMonth = 0, lostMonth = 0;
    let hasWeek = false, hasMonth = false;

    for (const t of (tradesRes.data || [])) {
      if (t.mise == null || t.cote == null || t.cote <= 1) continue;
      const alert = alertMap.get(`${t.match_id}__${t.signal_type}`);
      if (!alert) continue;
      if (!['validated', 'lost'].includes(alert.status)) continue;

      const inMonth = alert.match_date >= monthStartStr;
      const inWeek = alert.match_date >= weekStartStr;
      const gain = alert.status === 'validated' ? t.mise * (t.cote - 1) : -t.mise;

      if (inMonth) {
        sumMonth += gain;
        cntMonth++;
        hasMonth = true;
        if (alert.status === 'validated') validMonth++;
        else lostMonth++;
      }
      if (inWeek) {
        sumWeek += gain;
        cntWeek++;
        hasWeek = true;
        if (alert.status === 'validated') validWeek++;
        else lostWeek++;
      }
    }

    pnlWeek = hasWeek ? sumWeek : null;
    pnlMonth = hasMonth ? sumMonth : null;
    tradesWeekCount = cntWeek;
    tradesWeekValid = validWeek;
    tradesWeekLost = lostWeek;
    tradesMonthCount = cntMonth;
    tradesMonthValid = validMonth;
    tradesMonthLost = lostMonth;

    // Matchs distincts sélectionnés dans le mois courant.
    // String() obligatoire : selected_alerts.match_id est TEXT, alerts.match_id est bigint.
    const selectedMatchIds = new Set((selectedRes.data || []).map(s => String(s.match_id)));
    const alertsInMonth = new Set(
      (alertsRes.data || [])
        .filter(a => a.status === 'validated' || a.status === 'lost')
        .map(a => String(a.match_id))
    );
    let distinctMonthMatches = 0;
    for (const mid of selectedMatchIds) {
      if (alertsInMonth.has(mid)) distinctMonthMatches++;
    }
    matchesMonth = distinctMonthMatches;

    perfLoading = false;
  }

  function pnlLabel(val) {
    if (val === null) return '—';
    return `${val > 0 ? '+' : ''}${val.toFixed(2)} €`;
  }
  function pnlColor(val) {
    if (val === null) return 'muted';
    if (val > 0) return 'green';
    if (val < 0) return 'red';
    return 'muted';
  }

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

    const [generateRes, checkRes, seedRes, computeRes, pendingRes] = await Promise.all([
      supabase.from('cron_runs').select('started_at, status').eq('cron_name', 'generate-alerts').order('started_at', { ascending: false }).limit(1),
      supabase.from('cron_runs').select('started_at, status').eq('cron_name', 'check-results').order('started_at', { ascending: false }).limit(1),
      supabase.from('cron_runs').select('started_at, status').eq('cron_name', 'daily-seed').order('started_at', { ascending: false }).limit(1),
      supabase.from('cron_runs').select('started_at, status').eq('cron_name', 'compute-team-lg1').order('started_at', { ascending: false }).limit(1),
      supabase.from('alerts').select('id', { count: 'exact', head: true }).eq('status', 'pending').lt('match_date', cutoffStr),
    ]);

    if (!generateRes.error && generateRes.data?.length > 0) lastGenerateTs = generateRes.data[0].started_at;
    if (!checkRes.error && checkRes.data?.length > 0) lastCheckTs = checkRes.data[0].started_at;
    if (!seedRes.error && seedRes.data?.length > 0) lastSeedTs = seedRes.data[0].started_at;
    if (!computeRes.error && computeRes.data?.length > 0) lastComputeTs = computeRes.data[0].started_at;
    if (!pendingRes.error) pendingOld = pendingRes.count ?? 0;

    cronsLoading = false;
  }

  onMount(() => {
    loadAlerts();
    loadSeedStatus();
    loadTaux7j();
    loadCronHealth();
    loadPerformances();
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
      {/if}
    </div>

    <div
      class="metric-card"
      class:metric-card--ok={checkColorClass === 'green'}
      class:metric-card--warn={checkColorClass === 'orange'}
      class:metric-card--error={checkColorClass === 'red'}
    >
      <div class="metric-card__label">Vérification résultats</div>
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
          {lastRunLabel(lastCheckTs)}
        </div>
        <div class="metric-card__sub">{lastCheckTs ? `il y a ${hoursLabel(lastCheckTs)} · cron 1h` : 'jamais · cron 1h'}</div>
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
      {/if}
    </div>

    <div
      class="metric-card"
      class:metric-card--ok={pendingOldColorClass === 'green'}
      class:metric-card--error={pendingOldColorClass === 'red'}
    >
      <div class="metric-card__label">Alertes > 48h</div>
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
        <div class="metric-card__sub">{pendingOld === 0 ? 'aucune alerte bloquée' : `alerte${pendingOld > 1 ? 's' : ''} sans résultat`}</div>
      {/if}
    </div>

  </div>

  <div class="section-label">Alertes du jour</div>
  <div class="metric-grid metric-grid--3">

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

    <div class="metric-card">
      <div class="metric-card__label">Performance 7j</div>
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
        <div class="metric-card__sub">{validated7j} ✓ / {lost7j} ✗ matchs</div>
      {/if}
    </div>

  </div>

  {#if error}
    <p class="error-msg">{error}</p>
  {/if}

  <div class="section-label">Mes performances</div>
  <div class="metric-grid metric-grid--3">

    <div class="metric-card">
      <div class="metric-card__label">Renta de la semaine</div>
      {#if perfLoading}
        <div class="metric-card__value muted">—</div>
        <div class="metric-card__sub">chargement…</div>
      {:else if pnlWeek === null}
        <div class="metric-card__value muted">—</div>
        <div class="metric-card__sub">aucun trade</div>
      {:else}
        <div class="metric-card__value {pnlColor(pnlWeek)}">{pnlLabel(pnlWeek)}</div>
        <div class="metric-card__sub">{tradesWeekCount} trade{tradesWeekCount > 1 ? 's' : ''} · {tradesWeekValid} ✓ / {tradesWeekLost} ✗</div>
      {/if}
    </div>

    <div class="metric-card">
      <div class="metric-card__label">Renta du mois</div>
      {#if perfLoading}
        <div class="metric-card__value muted">—</div>
        <div class="metric-card__sub">chargement…</div>
      {:else if pnlMonth === null}
        <div class="metric-card__value muted">—</div>
        <div class="metric-card__sub">aucun trade</div>
      {:else}
        <div class="metric-card__value {pnlColor(pnlMonth)}">{pnlLabel(pnlMonth)}</div>
        <div class="metric-card__sub">{tradesMonthCount} trade{tradesMonthCount > 1 ? 's' : ''} · {tradesMonthValid} ✓ / {tradesMonthLost} ✗</div>
      {/if}
    </div>

    <div class="metric-card">
      <div class="metric-card__label">Matchs joués ce mois</div>
      {#if perfLoading}
        <div class="metric-card__value muted">—</div>
        <div class="metric-card__sub">chargement…</div>
      {:else}
        <div class="metric-card__value blue">{matchesMonth ?? 0}</div>
        <div class="metric-card__sub">sélectionné{matchesMonth > 1 ? 's' : ''} via Mes matchs</div>
      {/if}
    </div>

  </div>

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
