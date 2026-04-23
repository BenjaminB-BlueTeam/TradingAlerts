<script>
  import { onMount } from 'svelte';
  import { supabase, excludeAlert, unexcludeAlert } from '$lib/api/supabase.js';
  import { getDateStr, formatDateDMY, formatDate, formatTime, isInPlay, fhgColor, defeatColor } from '$lib/utils/formatters.js';
  import { loadTeamMatches as _loadTeamMatches, computeTeamStats, goalBar } from '$lib/utils/teamData.js';
  import ExcludeAlertModal from '$lib/components/ExcludeAlertModal.svelte';

  let alerts = $state([]);
  let loading = $state(true);
  let error = $state('');
  let selectedDay = $state(null); // null = tous
  let expandedId = $state(null);
  let teamMatchesCache = $state({});

  const days = [
    { label: 'Pass\u00e9s', offset: -3 },
    { label: "Aujourd'hui", offset: 0 },
    { label: 'Demain', offset: 1 },
    { label: 'Apr\u00e8s-demain', offset: 2 },
  ];

  let generating = $state(false);
  let genMessage = $state('');

  // Exclusion modale
  let excludeModalOpen = $state(false);
  let excludeModalAlert = $state(null);

  function openExcludeModal(alert) {
    excludeModalAlert = alert;
    excludeModalOpen = true;
  }

  async function handleExcluded(e) {
    const { tags, note } = e.detail;
    try {
      await excludeAlert(excludeModalAlert.match_id, tags, note);
      await loadAlerts();
    } catch (err) {
      console.error('excludeAlert error:', err);
    }
  }

  async function handleUnexclude(alert) {
    try {
      await unexcludeAlert(alert.match_id);
      await loadAlerts();
    } catch (err) {
      console.error('unexcludeAlert error:', err);
    }
  }

  async function handleGenerate() {
    generating = true;
    genMessage = '';
    try {
      const res = await fetch('/.netlify/functions/generate-alerts?type=FHG');
      const data = await res.json();
      if (data.error) {
        genMessage = `Erreur : ${data.error}`;
      } else if (data.alerts_created > 0) {
        genMessage = `${data.alerts_created} alerte${data.alerts_created > 1 ? 's' : ''} FHG créée${data.alerts_created > 1 ? 's' : ''}`;
        await loadAlerts(); // Recharger
      } else {
        genMessage = `Aucune alerte FHG — ${data.analyzed} matchs analysés, aucun ne correspond`;
      }
    } catch (e) {
      genMessage = `Erreur : ${e.message}`;
    }
    generating = false;
  }

  async function loadAlerts() {
    loading = true;
    error = '';
    const { data, error: dbError } = await supabase
      .from('alerts')
      .select('*')
      .gte('match_date', getDateStr(-3))
      .lte('match_date', getDateStr(2))
      .in('signal_type', ['FHG', 'FHG_DOM', 'FHG_EXT'])
      .order('match_date', { ascending: false })
      .order('kickoff_unix', { ascending: true });
    if (dbError) {
      console.error('loadAlerts error:', dbError);
      error = 'Impossible de charger les alertes FHG.';
      alerts = [];
    } else {
      alerts = data || [];
    }
    loading = false;
  }

  let filteredAlerts = $derived(alerts.filter(a => {
    if (selectedDay !== null && a.match_date !== getDateStr(selectedDay)) return false;
    return true;
  }));

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

  let hoverBar = $state(null); // { key, pct, min }

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

<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
  <div>
    <h1 class="page-title">⚡ Sélection FHG</h1>
    <p class="page-subtitle">
      {alerts.length} signal{alerts.length > 1 ? 's' : ''} FHG — 3 derniers jours + à venir
    </p>
  </div>
  <button class="btn btn--secondary btn--sm" onclick={handleGenerate} disabled={generating}>
    {generating ? '⏳...' : '🔄 Actualiser'}
  </button>
</div>
{#if genMessage}
  <div style="font-size:12px;padding:6px 12px;margin-bottom:8px;border-radius:6px;background:rgba(255,255,255,0.04);color:var(--color-text-muted);">{genMessage}</div>
{/if}

<div class="alerts-filters">
  <button class="alerts-filter-btn" class:active={selectedDay === null} aria-pressed={selectedDay === null} onclick={() => selectedDay = null}>
    Tous ({alerts.length})
  </button>
  {#each days as day}
    {@const count = alerts.filter(a => a.match_date === getDateStr(day.offset)).length}
    <button class="alerts-filter-btn" class:active={selectedDay === day.offset} aria-pressed={selectedDay === day.offset} onclick={() => selectedDay = (selectedDay === day.offset ? null : day.offset)}>
      {day.label} ({count})
    </button>
  {/each}
</div>

{#if error}
  <p class="error-msg">{error}</p>
{/if}

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
      Les alertes sont générées automatiquement toutes les 12h
    </div>
    <button class="btn btn--primary" style="margin-top:12px;" onclick={handleGenerate} disabled={generating}>
      {generating ? '⏳ Analyse en cours...' : '⚡ Lancer l\'analyse FHG maintenant'}
    </button>
    {#if genMessage}
      <div style="font-size:12px;margin-top:8px;color:var(--color-text-muted);">{genMessage}</div>
    {/if}
  </div>
{:else}
  <div class="alerts-list">
    {#each filteredAlerts as a (a.id)}
      <div class="alert-card"
        class:alert-card--expanded={expandedId === a.id}
        class:alert-card--validated={a.status === 'validated'}
        class:alert-card--lost={a.status === 'lost'}
        class:alert-card--live={a.status === 'pending' && isInPlay(a)}
      >
        <div class="alert-card__header" onclick={() => toggleExpand(a)} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpand(a); } }} role="button" tabindex="0" aria-expanded={expandedId === a.id}>
          <div class="alert-card__time">
            <div class="alert-card__day">{formatDateDMY(a.match_date)}</div>
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
            <span class="alert-badge {confidenceClass(a.confidence)}">{a.confidence}</span>
            {#if a.signal_type && a.signal_type !== 'FHG'}
              <span class="alert-badge alert-badge--signal">{a.signal_type === 'FHG_DOM' ? 'FHG Dom.' : a.signal_type === 'FHG_EXT' ? 'FHG Ext.' : a.signal_type}</span>
            {/if}
            {#if a.status === 'validated'}
              <span class="alert-badge alert-badge--validated">✓ Validé</span>
            {:else if a.status === 'lost'}
              <span class="alert-badge alert-badge--lost">✗ Perdu</span>
            {:else if isInPlay(a)}
              <span class="alert-badge alert-badge--live">EN COURS</span>
            {/if}
            {#if a.user_excluded}
              <span class="alert-badge alert-badge--exclu">EXCLUE</span>
              <button class="btn-exclude btn-exclude--reinstate" onclick={e => { e.stopPropagation(); handleUnexclude(a); }}>Réintégrer</button>
            {:else if a.status === 'pending'}
              <button class="btn-exclude" onclick={e => { e.stopPropagation(); openExcludeModal(a); }} title="Exclure">✕</button>
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
                          onmousemove={(e) => onBarMove(e, barKey)}
                          onmouseleave={onBarLeave}
                        >
                          <span class="goal-bar__marker" style="left:50%">HT</span>
                          <span class="goal-bar__marker" style="left:98%">FT</span>
                          {#if hoverBar?.key === barKey}
                            <div class="goal-cursor" style="left:{hoverBar.pct}%"></div>
                          {/if}
                          {#each bar.goals as g}
                            <span class="goal-dot" class:goal-dot--conceded={!g.scored} style="left:{g.pct}%" title="{g.label || g.min + '\''}"></span>
                          {/each}
                        </div>
                      </div>
                    </div>
                  {/each}
                </div>
              {:else}
                <p style="color:var(--color-text-muted);text-align:center;padding:1rem;font-size:13px;">Aucun match joue cette saison</p>
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
                          onmousemove={(e) => onBarMove(e, barKey)}
                          onmouseleave={onBarLeave}
                        >
                          <span class="goal-bar__marker" style="left:50%">HT</span>
                          <span class="goal-bar__marker" style="left:98%">FT</span>
                          {#if hoverBar?.key === barKey}
                            <div class="goal-cursor" style="left:{hoverBar.pct}%"></div>
                          {/if}
                          {#each bar.goals as g}
                            <span class="goal-dot" class:goal-dot--conceded={!g.scored} style="left:{g.pct}%" title="{g.label || g.min + '\''}"></span>
                          {/each}
                        </div>
                      </div>
                    </div>
                  {/each}
                </div>
              {:else}
                <p style="color:var(--color-text-muted);text-align:center;padding:1rem;font-size:13px;">Aucun match joue cette saison</p>
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

  .alert-card__badges { display: flex; gap: 4px; flex-shrink: 0; align-items: center; }
  .alert-badge--signal { background: rgba(61,142,247,0.15); color: var(--color-accent-blue); border: 1px solid rgba(61,142,247,0.3); }
  .alert-badge--exclu { background: rgba(100,100,100,0.15); color: #888; border: 1px solid #555; }
  .btn-exclude { background: none; border: 1px solid var(--color-border); color: var(--color-text-muted); font-size: 11px; padding: 2px 6px; border-radius: 4px; cursor: pointer; line-height: 1; transition: all 0.15s; }
  .btn-exclude:hover { border-color: #e53e3e; color: #e53e3e; }
  .btn-exclude--reinstate { border-color: var(--color-accent-blue); color: var(--color-accent-blue); }
  .btn-exclude--reinstate:hover { background: var(--color-accent-blue); color: #fff; }

  /* Expand */
  .alert-expand { border-top: 1px solid var(--color-border); padding: 16px; display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }

  @media (max-width: 1200px) {
    .alert-expand { grid-template-columns: 1fr; }
  }
  @media (max-width: 768px) {
    .alert-card__header { flex-wrap: wrap; }
    .alert-card__stats { width: 100%; }
  }
</style>

<ExcludeAlertModal
  alert={excludeModalAlert}
  bind:open={excludeModalOpen}
  on:excluded={handleExcluded}
/>
