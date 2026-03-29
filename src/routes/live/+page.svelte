<script>
  import { onMount, onDestroy } from 'svelte';
  import { supabase } from '$lib/api/supabase.js';
  import { getMatchDetail } from '$lib/api/footystats.js';

  const REFRESH_INTERVAL = 10_000;

  let liveMatches = [];
  let lastRefresh = null;
  let refreshing = false;
  let autoRefresh = true;
  let interval = null;

  function formatTime(unix) {
    if (!unix) return '—';
    return new Date(unix * 1000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  function getMatchMinute(kickoffUnix) {
    if (!kickoffUnix) return null;
    const elapsed = Math.floor((Date.now() / 1000 - kickoffUnix) / 60);
    if (elapsed < 0) return null;
    if (elapsed <= 45) return `${elapsed}'`;
    if (elapsed <= 60) return 'MT';
    if (elapsed <= 105) return `${elapsed - 15}'`;
    return '90+';
  }

  async function refresh() {
    refreshing = true;
    try {
      // 1. Charger les alertes du jour depuis Supabase
      const today = new Date().toISOString().split('T')[0];
      const { data: todayAlerts } = await supabase
        .from('alerts')
        .select('*')
        .eq('match_date', today)
        .eq('status', 'pending');

      if (!todayAlerts || todayAlerts.length === 0) {
        liveMatches = [];
        refreshing = false;
        return;
      }

      // 2. Filtrer : uniquement ceux dont le kickoff est passé
      const now = Math.floor(Date.now() / 1000);
      const inPlayAlerts = todayAlerts.filter(a =>
        a.kickoff_unix && a.kickoff_unix <= now && (now - a.kickoff_unix) < 7200 // moins de 2h depuis kickoff
      );

      if (inPlayAlerts.length === 0) {
        liveMatches = [];
        refreshing = false;
        return;
      }

      // 3. Fetch les scores live via endpoint match individuel (bypass cache)
      const matchDetails = await Promise.all(
        inPlayAlerts.map(a => getMatchDetail(a.match_id, true).catch(() => null))
      );

      // 4. Enrichir les alertes avec les scores live
      liveMatches = inPlayAlerts.map((a, i) => {
        const live = matchDetails[i] || {};
        const status = (live.status || '').toLowerCase();
        const isFinished = status === 'complete' || status === 'finished';

        // FootyStats ne fournit pas de scores en temps réel (status "incomplete" = en cours, score non mis à jour)
        const scoreAvailable = isFinished;

        return {
          ...a,
          homeGoals: scoreAvailable ? (live.homeGoalCount ?? null) : null,
          awayGoals: scoreAvailable ? (live.awayGoalCount ?? null) : null,
          htHome: live.ht_goals_team_a ?? null,
          htAway: live.ht_goals_team_b ?? null,
          minute: isFinished ? 'FT' : getMatchMinute(a.kickoff_unix),
          isFinished,
          liveStatus: status,
        };
      }).filter(m => !m.isFinished); // Exclure les terminés

      lastRefresh = new Date();
    } catch (e) {
      console.warn('Live refresh error:', e.message);
    }
    refreshing = false;
  }

  function startAutoRefresh() {
    stopAutoRefresh();
    if (autoRefresh) {
      interval = setInterval(refresh, REFRESH_INTERVAL);
    }
  }

  function stopAutoRefresh() {
    if (interval) { clearInterval(interval); interval = null; }
  }

  $: if (liveMatches.length > 0 && autoRefresh) {
    startAutoRefresh();
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

  function scoreDisplay(m) {
    if (m.isFinished && m.homeGoals !== null && m.awayGoals !== null) {
      return `${m.homeGoals} : ${m.awayGoals}`;
    }
    return '? : ?'; // FootyStats ne fournit pas les scores en temps réel
  }

  onMount(() => {
    refresh();
    // Checker toutes les 30s même sans match live (un match peut commencer)
    const checkInterval = setInterval(refresh, 30_000);
    return () => clearInterval(checkInterval);
  });

  onDestroy(() => { stopAutoRefresh(); });
</script>

<div class="page-title">📡 Live</div>
<div class="page-subtitle">
  Matchs alertes en cours
  {#if lastRefresh}
    <span class="live-last-refresh">
      — {lastRefresh.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
    </span>
  {/if}
</div>

<div class="live-toolbar">
  <button class="btn btn--sm" class:btn--primary={autoRefresh} class:btn--secondary={!autoRefresh}
    on:click={toggleAutoRefresh}>
    {autoRefresh ? '⏸ Pause' : '▶ Auto-refresh'}
  </button>
  <button class="btn btn--sm btn--secondary" on:click={refresh} disabled={refreshing}>
    {refreshing ? '⏳' : '🔄'} Refresh
  </button>
  {#if liveMatches.length > 0}
    <span class="live-indicator">🔴 {liveMatches.length} en cours</span>
  {/if}
</div>

{#if liveMatches.length === 0}
  <div class="empty-state" style="padding:40px;">
    <div class="empty-state__icon">📡</div>
    <div class="empty-state__title">Aucun match alerte en cours</div>
    <div style="font-size:12px;color:var(--color-text-muted);margin-top:8px;">
      Les matchs apparaissent ici automatiquement au coup d'envoi
    </div>
  </div>
{:else}
  <div class="live-list">
    {#each liveMatches as m (m.match_id)}
      <div class="live-card">
        <div class="live-card__minute">{m.minute || '⏱'}</div>
        <div class="live-card__match">
          <div class="live-card__teams">
            <span>{m.home_team_name}</span>
            <span class="live-card__score">{scoreDisplay(m)}</span>
            <span>{m.away_team_name}</span>
          </div>
          <div class="live-card__league">{m.league_name || '—'}</div>
        </div>
        <div class="live-card__signals">
          {#if m.signal_type === 'FHG' || m.signal_type === 'FHG+DC'}
            <span class="live-signal-badge live-signal-badge--fhg">FHG</span>
          {/if}
          {#if m.signal_type === 'DC' || m.signal_type === 'FHG+DC'}
            <span class="live-signal-badge live-signal-badge--dc">DC</span>
          {/if}
          <span class="live-signal-badge live-signal-badge--{m.confidence}">{m.confidence}</span>
        </div>
        <div class="live-card__stats">
          {#if m.fhg_pct}
            <span class="live-stat">FHG: {m.fhg_pct}%</span>
          {/if}
          {#if m.dc_defeat_pct !== null}
            <span class="live-stat">Def: {m.dc_defeat_pct}%</span>
          {/if}
        </div>
      </div>
    {/each}
  </div>
{/if}

<style>
  .live-last-refresh { font-size: 11px; color: var(--color-text-muted); }
  .live-toolbar { display: flex; gap: 8px; align-items: center; margin-bottom: 20px; }
  .live-indicator { font-size: 12px; font-weight: 600; color: var(--color-danger); margin-left: auto; animation: pulse 2s infinite; }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }

  .live-list { display: flex; flex-direction: column; gap: 6px; }
  .live-card { display: flex; align-items: center; gap: 14px; background: var(--color-bg-card); border: 1px solid var(--color-border); border-left: 3px solid var(--color-danger); border-radius: 8px; padding: 12px 16px; background: rgba(226, 75, 74, 0.04); }

  .live-card__minute { min-width: 40px; text-align: center; font-size: 14px; font-weight: 700; color: var(--color-danger); }
  .live-card__match { flex: 1; min-width: 0; }
  .live-card__teams { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 500; }
  .live-card__score { font-size: 16px; font-weight: 800; color: var(--color-text-primary); min-width: 50px; text-align: center; }
  .live-card__league { font-size: 11px; color: var(--color-text-muted); margin-top: 2px; }

  .live-card__signals { display: flex; gap: 4px; flex-shrink: 0; }
  .live-signal-badge { font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; text-transform: uppercase; }
  .live-signal-badge--fhg { background: rgba(29, 158, 117, 0.15); color: var(--color-accent-green); }
  .live-signal-badge--dc { background: rgba(55, 138, 221, 0.15); color: var(--color-accent-blue); }
  .live-signal-badge--fort { background: rgba(29, 158, 117, 0.15); color: var(--color-accent-green); }
  .live-signal-badge--moyen { background: rgba(239, 159, 39, 0.15); color: var(--color-signal-moyen); }

  .live-card__stats { display: flex; flex-direction: column; gap: 2px; flex-shrink: 0; }
  .live-stat { font-size: 11px; color: var(--color-text-muted); }

  @media (max-width: 640px) {
    .live-card { flex-wrap: wrap; }
    .live-card__signals, .live-card__stats { width: 100%; flex-direction: row; gap: 8px; }
  }
</style>
