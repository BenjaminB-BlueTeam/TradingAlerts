<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/api/supabase.js';
  import { getDateStr, formatDate, formatTime, isInPlay, fhgColor, defeatColor } from '$lib/utils/formatters.js';
  import { loadTeamMatches as _loadTeamMatches, computeTeamStats, goalBar } from '$lib/utils/teamData.js';

  let alerts = [];
  let loading = true;
  let selectedDay = null; // null = tous
  let expandedId = null;
  let teamMatchesCache = {};

  const days = [
    { label: 'Pass\u00e9s', offset: -3 },
    { label: "Aujourd'hui", offset: 0 },
    { label: 'Demain', offset: 1 },
    { label: 'Apr\u00e8s-demain', offset: 2 },
  ];

  async function loadAlerts() {
    loading = true;
    const { data, error } = await supabase
      .from('alerts')
      .select('*')
      .gte('match_date', getDateStr(-3))
      .lte('match_date', getDateStr(2))
      .in('signal_type', ['FHG', 'FHG+DC'])
      .order('match_date', { ascending: false })
      .order('kickoff_unix', { ascending: true });
    alerts = error ? [] : (data || []);
    loading = false;
  }

  $: filteredAlerts = alerts.filter(a => {
    if (selectedDay !== null && a.match_date !== getDateStr(selectedDay)) return false;
    return true;
  });

  // Charger les derniers matchs d'une \u00e9quipe dans son contexte
  async function loadTeamMatches(teamId, context) {
    const key = `${teamId}_${context}`;
    if (teamMatchesCache[key]) return teamMatchesCache[key];

    const data = await _loadTeamMatches(teamId, context, supabase);
    teamMatchesCache[key] = data;
    teamMatchesCache = teamMatchesCache;
    return data;
  }

  async function toggleExpand(alert) {
    if (expandedId === alert.id) {
      expandedId = null;
      return;
    }
    // Charger les donn\u00e9es AVANT d'ouvrir l'expand
    await Promise.all([
      loadTeamMatches(alert.home_team_id, 'home'),
      loadTeamMatches(alert.away_team_id, 'away'),
    ]);
    expandedId = alert.id;
  }

  function getTeamMatches(teamId, context) {
    return teamMatchesCache[`${teamId}_${context}`] || [];
  }

  function confidenceClass(c) {
    return c === 'fort' ? 'alert-badge--fort' : 'alert-badge--moyen';
  }

  let hoverBar = null; // { key, pct, min }

  function onBarMove(e, key) {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, (e.clientX - rect.left) / rect.width * 100));
    const min = Math.round(pct / 100 * 95);
    hoverBar = { key, pct, min };
  }

  function onBarLeave() {
    hoverBar = null;
  }

  onMount(() => { loadAlerts(); });
</script>

<div class="page-title">⚡ Sélection FHG</div>
<div class="page-subtitle">
  {alerts.length} signal{alerts.length > 1 ? 's' : ''} FHG — 3 derniers jours + à venir
</div>

<div class="alerts-filters">
  <button class="alerts-filter-btn" class:active={selectedDay === null} on:click={() => selectedDay = null}>
    Tous ({alerts.length})
  </button>
  {#each days as day}
    {@const count = alerts.filter(a => a.match_date === getDateStr(day.offset)).length}
    <button class="alerts-filter-btn" class:active={selectedDay === day.offset} on:click={() => selectedDay = (selectedDay === day.offset ? null : day.offset)}>
      {day.label} ({count})
    </button>
  {/each}
</div>

{#if loading}
  <div class="empty-state" style="padding:40px;">
    <div class="empty-state__icon">⏳</div>
    <div class="empty-state__title">Chargement des alertes...</div>
  </div>
{:else if filteredAlerts.length === 0}
  <div class="empty-state" style="padding:40px;">
    <div class="empty-state__icon">🔔</div>
    <div class="empty-state__title">Aucune alerte</div>
    <div style="font-size:12px;color:var(--color-text-muted);margin-top:8px;">
      Les alertes sont generees automatiquement toutes les 12h
    </div>
  </div>
{:else}
  <div class="alerts-list">
    {#each filteredAlerts as a (a.id)}
      <!-- svelte-ignore a11y-click-events-have-key-events -->
      <div class="alert-card"
        class:alert-card--expanded={expandedId === a.id}
        class:alert-card--validated={a.status === 'validated'}
        class:alert-card--lost={a.status === 'lost'}
        class:alert-card--live={a.status === 'pending' && isInPlay(a)}
      >
        <div class="alert-card__header" on:click={() => toggleExpand(a)} role="button" tabindex="0">
          <div class="alert-card__time">
            <div class="alert-card__day">{a.match_date}</div>
            <div class="alert-card__hour">{formatTime(a.kickoff_unix)}</div>
          </div>
          <div class="alert-card__match">
            <div class="alert-card__teams">{a.home_team_name} vs {a.away_team_name}</div>
            <div class="alert-card__league">{a.league_name || '—'}</div>
          </div>
          <div class="alert-card__stats">
            {#if a.fhg_pct}
              <div class="alert-pill">
                <span class="alert-pill__label">FHG</span>
                <span class="alert-pill__value" style:color={fhgColor(a.fhg_pct)}>{a.fhg_pct}%</span>
              </div>
            {/if}
            {#if a.dc_defeat_pct !== null}
              <div class="alert-pill">
                <span class="alert-pill__label">DC def.</span>
                <span class="alert-pill__value" style:color={defeatColor(a.dc_defeat_pct)}>{a.dc_defeat_pct}%</span>
              </div>
            {/if}
            <div class="alert-pill">
              <span class="alert-pill__label">H2H</span>
              <span class="alert-pill__value">{a.h2h_count}</span>
            </div>
          </div>
          <div class="alert-card__badges">
            {#if a.signal_type === 'FHG+DC'}
              <span class="alert-badge alert-badge--dc">+DC</span>
            {/if}
            <span class="alert-badge {confidenceClass(a.confidence)}">{a.confidence}</span>
            {#if a.status === 'validated'}
              <span class="alert-badge alert-badge--validated">✓ Validé</span>
            {:else if a.status === 'lost'}
              <span class="alert-badge alert-badge--lost">✗ Perdu</span>
            {:else if isInPlay(a)}
              <span class="alert-badge alert-badge--live">EN COURS</span>
            {/if}
          </div>
          <span class="alert-card__arrow">{expandedId === a.id ? '▼' : '▶'}</span>
        </div>

        {#if expandedId === a.id}
          {@const homeMatches = getTeamMatches(a.home_team_id, 'home')}
          {@const homeStats = computeTeamStats(homeMatches, 'home')}
          {@const awayMatches = getTeamMatches(a.away_team_id, 'away')}
          {@const awayStats = computeTeamStats(awayMatches, 'away')}
          <div class="alert-expand">
            <div class="team-detail">
              <div class="team-detail__header">
                <span class="team-detail__name">{a.home_team_name}</span>
                <span class="team-detail__context">Domicile</span>
                {#if hoverBar?.key === `${a.id}_home`}
                  <span class="bar-hover-min">{hoverBar.min}'</span>
                {/if}
                {#if homeStats}
                  <div class="team-detail__summary">
                    <span>1MT: <strong style:color={fhgColor(homeStats.pctGoal1MT)}>{homeStats.pctGoal1MT}%</strong></span>
                    <span>AVG: <strong>{homeStats.avgGoals}</strong></span>
                  </div>
                {/if}
              </div>
              {#if homeMatches.length > 0}
                <div class="team-matches">
                  {#each homeMatches as m}
                    {@const bar = goalBar(m, 'home')}
                    {@const barKey = `${a.id}_home`}
                    <div class="match-row">
                      <span class="match-row__date">{formatDate(m.match_date)}</span>
                      <span class="match-row__home match-row__bold">{m.home_team_name}</span>
                      <span class="match-row__score match-row__score--{bar.result}">{m.home_goals}-{m.away_goals}</span>
                      <span class="match-row__away">{m.away_team_name}</span>
                      <div class="match-row__bar">
                        <div class="goal-bar"
                          on:mousemove={(e) => onBarMove(e, barKey)}
                          on:mouseleave={onBarLeave}
                        >
                          <span class="goal-bar__marker" style="left:50%">HT</span>
                          <span class="goal-bar__marker" style="left:98%">FT</span>
                          {#if hoverBar?.key === barKey}
                            <div class="goal-cursor" style="left:{hoverBar.pct}%"></div>
                          {/if}
                          {#each bar.goals as g}
                            <span class="goal-dot" class:goal-dot--conceded={!g.scored} style="left:{g.pct}%" title="{g.min}'"></span>
                          {/each}
                        </div>
                      </div>
                    </div>
                  {/each}
                </div>
              {:else}
                <div class="team-detail__empty">Aucun match recent</div>
              {/if}
            </div>

            <div class="team-detail">
              <div class="team-detail__header">
                <span class="team-detail__name">{a.away_team_name}</span>
                <span class="team-detail__context">Exterieur</span>
                {#if hoverBar?.key === `${a.id}_away`}
                  <span class="bar-hover-min">{hoverBar.min}'</span>
                {/if}
                {#if awayStats}
                  <div class="team-detail__summary">
                    <span>1MT: <strong style:color={fhgColor(awayStats.pctGoal1MT)}>{awayStats.pctGoal1MT}%</strong></span>
                    <span>AVG: <strong>{awayStats.avgGoals}</strong></span>
                  </div>
                {/if}
              </div>
              {#if awayMatches.length > 0}
                <div class="team-matches">
                  {#each awayMatches as m}
                    {@const bar = goalBar(m, 'away')}
                    {@const barKey = `${a.id}_away`}
                    <div class="match-row">
                      <span class="match-row__date">{formatDate(m.match_date)}</span>
                      <span class="match-row__home">{m.home_team_name}</span>
                      <span class="match-row__score match-row__score--{bar.result}">{m.home_goals}-{m.away_goals}</span>
                      <span class="match-row__away match-row__bold">{m.away_team_name}</span>
                      <div class="match-row__bar">
                        <div class="goal-bar"
                          on:mousemove={(e) => onBarMove(e, barKey)}
                          on:mouseleave={onBarLeave}
                        >
                          <span class="goal-bar__marker" style="left:50%">HT</span>
                          <span class="goal-bar__marker" style="left:98%">FT</span>
                          {#if hoverBar?.key === barKey}
                            <div class="goal-cursor" style="left:{hoverBar.pct}%"></div>
                          {/if}
                          {#each bar.goals as g}
                            <span class="goal-dot" class:goal-dot--conceded={!g.scored} style="left:{g.pct}%" title="{g.min}'"></span>
                          {/each}
                        </div>
                      </div>
                    </div>
                  {/each}
                </div>
              {:else}
                <div class="team-detail__empty">Aucun match recent</div>
              {/if}
            </div>
          </div>
        {/if}
      </div>
    {/each}
  </div>
{/if}

<style>
  .alerts-filters { display: flex; gap: 4px; margin-bottom: 20px; flex-wrap: wrap; }
  .alerts-filter-btn { background: rgba(255,255,255,0.05); border: 1px solid var(--color-border); border-radius: 6px; padding: 5px 12px; font-size: 12px; color: var(--color-text-muted); cursor: pointer; transition: all 0.15s; }
  .alerts-filter-btn.active { background: var(--color-accent-blue); border-color: var(--color-accent-blue); color: white; }

  .alerts-list { display: flex; flex-direction: column; gap: 8px; }

  .alert-card { background: var(--color-bg-card); border: 1px solid var(--color-border); border-radius: 10px; overflow: hidden; transition: border-color 0.2s; }
  .alert-card:hover { border-color: var(--color-accent-blue); }
  .alert-card--expanded { border-color: var(--color-accent-blue); }
  .alert-card--validated { border-color: var(--color-accent-green) !important; background: rgba(29,158,117,0.04); }
  .alert-card--lost { border-color: var(--color-danger) !important; background: rgba(226,75,74,0.04); }
  .alert-card--live { border-color: var(--color-signal-moyen) !important; background: rgba(239,159,39,0.04); }

  .alert-card__header { display: flex; align-items: center; gap: 14px; padding: 12px 16px; cursor: pointer; transition: background 0.15s; }
  .alert-card__header:hover { background: rgba(255,255,255,0.02); }

  .alert-card__time { min-width: 65px; text-align: center; }
  .alert-card__day { font-size: 10px; color: var(--color-text-muted); }
  .alert-card__hour { font-size: 14px; font-weight: 600; }
  .alert-card__match { flex: 1; min-width: 0; }
  .alert-card__teams { font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .alert-card__league { font-size: 11px; color: var(--color-text-muted); margin-top: 2px; }
  .alert-card__arrow { font-size: 11px; color: var(--color-text-muted); flex-shrink: 0; }

  .alert-card__stats { display: flex; gap: 6px; flex-shrink: 0; }
  .alert-pill { display: flex; flex-direction: column; align-items: center; background: rgba(255,255,255,0.04); border-radius: 6px; padding: 3px 8px; min-width: 44px; }
  .alert-pill__label { font-size: 9px; font-weight: 600; text-transform: uppercase; color: var(--color-text-muted); }
  .alert-pill__value { font-size: 13px; font-weight: 700; }

  .alert-card__badges { display: flex; gap: 4px; flex-shrink: 0; }
  .alert-badge { font-size: 10px; font-weight: 700; padding: 3px 8px; border-radius: 4px; text-transform: uppercase; }
  .alert-badge--fhg { background: rgba(29, 158, 117, 0.15); color: var(--color-accent-green); }
  .alert-badge--dc { background: rgba(55, 138, 221, 0.15); color: var(--color-accent-blue); }
  .alert-badge--fort { background: rgba(29, 158, 117, 0.15); color: var(--color-accent-green); }
  .alert-badge--moyen { background: rgba(239, 159, 39, 0.15); color: var(--color-signal-moyen); }
  .alert-badge--validated { background: rgba(29, 158, 117, 0.2); color: var(--color-accent-green); }
  .alert-badge--lost { background: rgba(226, 75, 74, 0.2); color: var(--color-danger); }
  .alert-badge--live { background: rgba(239, 159, 39, 0.2); color: var(--color-signal-moyen); animation: pulse 2s infinite; }

  /* Expand */
  .alert-expand { border-top: 1px solid var(--color-border); padding: 16px; display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }

  .team-detail { background: rgba(255,255,255,0.02); border-radius: 8px; padding: 10px; }
  .team-detail__header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; flex-wrap: wrap; }
  .team-detail__name { font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 120px; }
  .team-detail__context { font-size: 9px; font-weight: 600; text-transform: uppercase; color: var(--color-accent-blue); background: rgba(55,138,221,0.12); padding: 2px 5px; border-radius: 4px; flex-shrink: 0; }
  .team-detail__summary { display: flex; gap: 8px; margin-left: auto; font-size: 10px; color: var(--color-text-muted); flex-shrink: 0; }
  .team-detail__summary strong { color: var(--color-text-primary); }
  .team-detail__empty { padding: 12px; text-align: center; color: var(--color-text-muted); font-size: 12px; }

  .team-matches { display: table; width: 100%; border-collapse: collapse; }

  .match-row { display: table-row; font-size: 11px; }
  .match-row > span, .match-row > div { display: table-cell; vertical-align: middle; padding: 3px 3px; border-bottom: 1px solid rgba(255,255,255,0.03); }
  .match-row__date { width: 44px; color: var(--color-text-muted); font-size: 10px; }
  .match-row__home, .match-row__away { width: 75px; max-width: 75px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .match-row__bold { font-weight: 600; color: var(--color-text-primary); }
  .match-row__score { width: 28px; font-weight: 700; text-align: center; border-radius: 3px; }
  .match-row__score--W { color: var(--color-accent-green); }
  .match-row__score--D { color: var(--color-signal-moyen); }
  .match-row__score--L { color: var(--color-danger); }

  .match-row__bar { width: auto; }
  .goal-bar { position: relative; height: 20px; min-width: 160px; background: linear-gradient(90deg, #2a7a52 0%, #2a7a52 50%, #1e6340 50%, #1e6340 100%); border-radius: 3px; }
  .goal-bar__marker { position: absolute; top: 50%; transform: translate(-50%, -50%); font-size: 8px; font-weight: 700; color: rgba(255,255,255,0.35); z-index: 1; pointer-events: none; }
  .goal-dot {
    position: absolute; top: 50%; transform: translate(-50%, -50%); z-index: 2; cursor: default;
    width: 22px; height: 22px;
    background: url('/ballon.png') center/contain no-repeat;
    filter: drop-shadow(0 1px 1px rgba(0,0,0,0.3));
  }
  .goal-dot--conceded {
    opacity: 0.5;
  }

  .goal-cursor { position: absolute; top: 0; bottom: 0; width: 1px; background: rgba(0,0,0,0.75); transform: translateX(-50%); pointer-events: none; z-index: 3; }
  .bar-hover-min { font-size: 11px; font-weight: 700; color: var(--color-text-primary); background: rgba(255,255,255,0.1); padding: 1px 6px; border-radius: 4px; }

  @media (max-width: 1200px) {
    .alert-expand { grid-template-columns: 1fr; }
  }
  @media (max-width: 768px) {
    .alert-card__header { flex-wrap: wrap; }
    .alert-card__stats { width: 100%; }
    .match-row__home, .match-row__away { width: 55px; max-width: 55px; }
    .team-detail__summary { margin-left: 0; width: 100%; }
  }
</style>
