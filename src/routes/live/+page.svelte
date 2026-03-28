<script>
  import { onMount, onDestroy } from 'svelte';
  import { watchlist } from '$lib/stores/appStore.js';
  import { getTodaysMatches } from '$lib/api/footystats.js';

  const REFRESH_INTERVAL = 10_000; // 10 secondes

  let liveMatches = [];
  let upcomingMatches = [];
  let finishedMatches = [];
  let lastRefresh = null;
  let refreshing = false;
  let autoRefresh = true;
  let interval = null;

  function getDateStr() {
    return new Date().toISOString().split('T')[0];
  }

  function formatTime(unix) {
    if (!unix) return '—';
    return new Date(unix * 1000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  function getMatchMinute(match) {
    // Estimer la minute actuelle à partir du kickoff
    if (!match.date_unix) return null;
    const kickoff = match.date_unix * 1000;
    const now = Date.now();
    const elapsed = Math.floor((now - kickoff) / 60000);
    if (elapsed < 0) return null;
    if (elapsed > 90) return '90+';
    // Approximation : mi-temps entre 45-60 min
    if (elapsed >= 45 && elapsed <= 60) return 'MT';
    if (elapsed > 60) return `${elapsed - 15}'`; // soustraire ~15 min de pause
    return `${elapsed}'`;
  }

  async function refresh() {
    refreshing = true;
    try {
      const todayStr = getDateStr();
      const allToday = await getTodaysMatches(todayStr);
      if (!Array.isArray(allToday)) { refreshing = false; return; }

      // IDs des matchs dans la watchlist
      const watchIds = new Set($watchlist.map(m => m.id));
      const watchMap = new Map($watchlist.map(m => [m.id, m]));

      // Filtrer les matchs de la watchlist
      const watchedToday = allToday.filter(m => watchIds.has(m.id));

      // Classer par statut
      const live = [];
      const upcoming = [];
      const finished = [];

      for (const m of watchedToday) {
        const w = watchMap.get(m.id) || {};
        const enriched = {
          ...m,
          signals: w.signals || [],
          fhgPct: w.fhgPct,
          dcDefeatPct: w.dcDefeatPct,
          home_name: m.home_name || w.home_name || 'Home',
          away_name: m.away_name || w.away_name || 'Away',
          league_name: m.competition_name || w.league_name || '—',
        };

        const status = (m.status || '').toLowerCase();
        if (status === 'complete' || status === 'finished') {
          finished.push(enriched);
        } else if (status === 'inplay' || status === 'live' || status === 'halftime') {
          enriched._minute = getMatchMinute(m);
          live.push(enriched);
        } else {
          upcoming.push(enriched);
        }
      }

      // Aussi ajouter les matchs watchlist non trouvés dans today (ex: demain)
      for (const w of $watchlist) {
        if (!watchedToday.find(m => m.id === w.id)) {
          upcoming.push({
            ...w,
            status: 'upcoming',
            homeGoalCount: null,
            awayGoalCount: null,
            home_name: w.home_name,
            away_name: w.away_name,
            league_name: w.league_name,
          });
        }
      }

      liveMatches = live;
      upcomingMatches = upcoming.sort((a, b) => (a.date_unix || 0) - (b.date_unix || 0));
      finishedMatches = finished;
      lastRefresh = new Date();
    } catch (e) {
      console.warn('Live refresh error:', e.message);
    }
    refreshing = false;
  }

  function startAutoRefresh() {
    stopAutoRefresh();
    if (autoRefresh && liveMatches.length > 0) {
      interval = setInterval(refresh, REFRESH_INTERVAL);
    }
  }

  function stopAutoRefresh() {
    if (interval) { clearInterval(interval); interval = null; }
  }

  // Relancer l'auto-refresh quand le nombre de matchs live change
  $: if (liveMatches.length > 0 && autoRefresh) {
    startAutoRefresh();
  } else {
    stopAutoRefresh();
  }

  function toggleAutoRefresh() {
    autoRefresh = !autoRefresh;
    if (autoRefresh) {
      refresh();
      startAutoRefresh();
    } else {
      stopAutoRefresh();
    }
  }

  function signalBadges(signals) {
    return signals || [];
  }

  function scoreDisplay(m) {
    const home = m.homeGoalCount ?? m.home_goals ?? null;
    const away = m.awayGoalCount ?? m.away_goals ?? null;
    if (home === null || away === null) return '— : —';
    return `${home} : ${away}`;
  }

  onMount(() => {
    refresh();
    // Premier refresh puis auto si matchs live
    const initInterval = setInterval(() => {
      if (liveMatches.length > 0) {
        startAutoRefresh();
        clearInterval(initInterval);
      }
    }, REFRESH_INTERVAL);

    return () => clearInterval(initInterval);
  });

  onDestroy(() => {
    stopAutoRefresh();
  });
</script>

<div class="page-title">📡 Live</div>
<div class="page-subtitle">
  Surveillance des matchs alertés en temps réel
  {#if lastRefresh}
    <span class="live-last-refresh">
      — mis à jour à {lastRefresh.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
    </span>
  {/if}
</div>

<div class="live-toolbar">
  <button class="btn btn--sm" class:btn--primary={autoRefresh} class:btn--secondary={!autoRefresh}
    on:click={toggleAutoRefresh}>
    {autoRefresh ? '⏸ Pause auto-refresh' : '▶ Activer auto-refresh'}
  </button>
  <button class="btn btn--sm btn--secondary" on:click={refresh} disabled={refreshing}>
    {refreshing ? '⏳' : '🔄'} Refresh
  </button>
  {#if liveMatches.length > 0}
    <span class="live-indicator">🔴 {liveMatches.length} match{liveMatches.length > 1 ? 's' : ''} en cours</span>
  {/if}
</div>

{#if $watchlist.length === 0}
  <div class="empty-state" style="padding:40px;">
    <div class="empty-state__icon">📡</div>
    <div class="empty-state__title">Aucun match à surveiller</div>
    <div style="font-size:12px;color:var(--color-text-muted);margin-top:8px;">
      Les matchs apparaissent ici automatiquement depuis la page Alertes
    </div>
  </div>
{:else}

  <!-- MATCHS EN COURS -->
  {#if liveMatches.length > 0}
    <div class="live-section">
      <div class="live-section__header live-section__header--live">
        <span>🔴 En cours</span>
        <span class="live-section__count">{liveMatches.length}</span>
      </div>
      <div class="live-list">
        {#each liveMatches as m (m.id)}
          <div class="live-card live-card--inplay">
            <div class="live-card__minute">{m._minute || '⏱'}</div>
            <div class="live-card__match">
              <div class="live-card__teams">
                <span>{m.home_name}</span>
                <span class="live-card__score">{scoreDisplay(m)}</span>
                <span>{m.away_name}</span>
              </div>
              <div class="live-card__league">{m.league_name}</div>
            </div>
            <div class="live-card__signals">
              {#each signalBadges(m.signals) as s}
                <span class="live-signal-badge live-signal-badge--{s.toLowerCase()}">{s}</span>
              {/each}
            </div>
            <div class="live-card__stats">
              {#if m.fhgPct}
                <span class="live-stat" title="But 1MT H2H">1MT: {m.fhgPct}%</span>
              {/if}
              {#if m.dcDefeatPct !== null && m.dcDefeatPct !== undefined}
                <span class="live-stat" title="Défaite H2H">Def: {m.dcDefeatPct}%</span>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- MATCHS A VENIR -->
  {#if upcomingMatches.length > 0}
    <div class="live-section">
      <div class="live-section__header">
        <span>⏳ A venir</span>
        <span class="live-section__count">{upcomingMatches.length}</span>
      </div>
      <div class="live-list">
        {#each upcomingMatches as m (m.id)}
          <div class="live-card">
            <div class="live-card__time">{formatTime(m.date_unix)}</div>
            <div class="live-card__match">
              <div class="live-card__teams">
                <span>{m.home_name}</span>
                <span class="live-card__vs">vs</span>
                <span>{m.away_name}</span>
              </div>
              <div class="live-card__league">{m.league_name}</div>
            </div>
            <div class="live-card__signals">
              {#each signalBadges(m.signals) as s}
                <span class="live-signal-badge live-signal-badge--{s.toLowerCase()}">{s}</span>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- MATCHS TERMINES -->
  {#if finishedMatches.length > 0}
    <div class="live-section">
      <div class="live-section__header">
        <span>✅ Terminés</span>
        <span class="live-section__count">{finishedMatches.length}</span>
      </div>
      <div class="live-list">
        {#each finishedMatches as m (m.id)}
          <div class="live-card live-card--finished">
            <div class="live-card__time">FT</div>
            <div class="live-card__match">
              <div class="live-card__teams">
                <span>{m.home_name}</span>
                <span class="live-card__score">{scoreDisplay(m)}</span>
                <span>{m.away_name}</span>
              </div>
              <div class="live-card__league">{m.league_name}</div>
            </div>
            <div class="live-card__signals">
              {#each signalBadges(m.signals) as s}
                <span class="live-signal-badge live-signal-badge--{s.toLowerCase()}">{s}</span>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}
{/if}

<style>
  .live-last-refresh {
    font-size: 11px;
    color: var(--color-text-muted);
  }
  .live-toolbar {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-bottom: 20px;
  }
  .live-indicator {
    font-size: 12px;
    font-weight: 600;
    color: var(--color-danger);
    margin-left: auto;
    animation: pulse 2s infinite;
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .live-section {
    margin-bottom: 24px;
  }
  .live-section__header {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    font-weight: 600;
    padding-bottom: 8px;
    margin-bottom: 10px;
    border-bottom: 1px solid var(--color-border);
    color: var(--color-text-secondary);
  }
  .live-section__header--live {
    color: var(--color-danger);
  }
  .live-section__count {
    background: rgba(255,255,255,0.08);
    color: var(--color-text-muted);
    font-size: 11px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 10px;
    margin-left: auto;
  }

  .live-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .live-card {
    display: flex;
    align-items: center;
    gap: 14px;
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    padding: 12px 16px;
    transition: border-color 0.15s;
  }
  .live-card--inplay {
    border-left: 3px solid var(--color-danger);
    background: rgba(226, 75, 74, 0.04);
  }
  .live-card--finished {
    opacity: 0.7;
  }

  .live-card__minute {
    min-width: 40px;
    text-align: center;
    font-size: 14px;
    font-weight: 700;
    color: var(--color-danger);
  }
  .live-card__time {
    min-width: 40px;
    text-align: center;
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text-muted);
  }

  .live-card__match {
    flex: 1;
    min-width: 0;
  }
  .live-card__teams {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 500;
  }
  .live-card__score {
    font-size: 16px;
    font-weight: 800;
    color: var(--color-text-primary);
    min-width: 50px;
    text-align: center;
  }
  .live-card__vs {
    font-size: 11px;
    color: var(--color-text-muted);
  }
  .live-card__league {
    font-size: 11px;
    color: var(--color-text-muted);
    margin-top: 2px;
  }

  .live-card__signals {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
  }
  .live-signal-badge {
    font-size: 10px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 4px;
    text-transform: uppercase;
  }
  .live-signal-badge--fhg {
    background: rgba(29, 158, 117, 0.15);
    color: var(--color-accent-green);
  }
  .live-signal-badge--dc {
    background: rgba(55, 138, 221, 0.15);
    color: var(--color-accent-blue);
  }

  .live-card__stats {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex-shrink: 0;
  }
  .live-stat {
    font-size: 11px;
    color: var(--color-text-muted);
    white-space: nowrap;
  }

  @media (max-width: 640px) {
    .live-card {
      flex-wrap: wrap;
    }
    .live-card__signals, .live-card__stats {
      width: 100%;
      flex-direction: row;
      justify-content: flex-start;
      gap: 8px;
    }
  }
</style>
