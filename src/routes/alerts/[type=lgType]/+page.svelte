<script>
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { supabase } from '$lib/api/supabase.js';
  import { getDateStr, formatDateDMY, formatDate, formatTime } from '$lib/utils/formatters.js';
  import { loadTeamMatches as _loadTeamMatches, computeTeamStats, goalBar } from '$lib/utils/teamData.js';
  import { leagueFlagUrl } from '$lib/utils/countryFlags.js';
  import SelectAlertButton from '$lib/components/SelectAlertButton.svelte';
  import { callFunction } from '$lib/api/functions.js';
  import TeamLgBadges from '$lib/components/TeamLgBadges.svelte';

  // Type courant : 'lg1' ou 'lg2'
  let type = $derived($page.params.type);
  let isLg1 = $derived(type === 'lg1');

  const SIGNALS = {
    lg1: ['LG1_A', 'LG1_B', 'LG1_A+B', 'LG1_C', 'LG1_D', 'LG1_MANUAL'],
    lg2: ['LG2_A', 'LG2_B', 'LG2_A+B', 'LG2_MANUAL'],
  };

  let alerts = $state([]);
  let loading = $state(true);
  let error = $state('');
  let selectedDay = $state(0);
  let expandedId = $state(null);
  let teamMatchesCache = $state({});

  const days = [
    { label: 'Passés', offset: -3 },
    { label: "Aujourd'hui", offset: 0 },
    { label: 'Demain', offset: 1 },
    { label: 'Après-demain', offset: 2 },
  ];

  let generating = $state(false);
  let genMessage = $state('');
  let deleting = $state(false);
  let deleteMessage = $state('');

  let selectedLeague = $state('toutes');
  let selectedConfs = $state(new Set(['fort']));

  // Quand le type change (navigation entre tabs), réinitialiser les filtres et recharger
  $effect(() => {
    const _t = type;
    selectedDay = 0;
    selectedLeague = 'toutes';
    selectedConfs = new Set(['fort']);
    expandedId = null;
    teamMatchesCache = {};
    alerts = [];
    loading = true;
    error = '';
    genMessage = '';
    deleteMessage = '';
    loadAlerts();
  });

  async function handleDeleteVisible() {
    const ids = filteredAlerts.map(a => a.id);
    if (ids.length === 0) return;
    if (!confirm(`Supprimer ${ids.length} alerte${ids.length > 1 ? 's' : ''} visible${ids.length > 1 ? 's' : ''} ?`)) return;
    deleting = true;
    deleteMessage = '';
    try {
      const res = await callFunction('/.netlify/functions/delete-alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      const data = await res.json();
      if (data.error) {
        deleteMessage = `Erreur : ${data.error}`;
      } else {
        deleteMessage = `${data.deleted} alerte${data.deleted > 1 ? 's' : ''} supprimée${data.deleted > 1 ? 's' : ''}`;
        await loadAlerts();
      }
    } catch (e) {
      deleteMessage = `Erreur : ${e.message}`;
    }
    deleting = false;
  }

  async function handleGenerate() {
    generating = true;
    genMessage = '';
    const typeUpper = type.toUpperCase();
    try {
      const res = await callFunction(`/.netlify/functions/generate-alerts?type=${typeUpper}`);
      const data = await res.json();
      if (data.error) {
        genMessage = `Erreur : ${data.error}`;
      } else if (data.alerts_created > 0) {
        genMessage = `${data.alerts_created} alerte${data.alerts_created > 1 ? 's' : ''} ${typeUpper} créée${data.alerts_created > 1 ? 's' : ''}`;
        await loadAlerts();
      } else {
        genMessage = `Aucune alerte ${typeUpper} — ${data.analyzed} matchs analysés${isLg1 ? ', aucun ne correspond' : ''}`;
      }
    } catch (e) {
      genMessage = `Erreur : ${e.message}`;
    }
    generating = false;
  }

  async function loadAlerts() {
    loading = true;
    error = '';
    const signals = SIGNALS[type] || SIGNALS.lg1;
    const { data, error: dbError } = await supabase
      .from('alerts')
      .select('*')
      .gte('match_date', getDateStr(-3))
      .lte('match_date', getDateStr(2))
      .in('signal_type', signals)
      .order('match_date', { ascending: false })
      .order('kickoff_unix', { ascending: true });
    if (dbError) {
      console.error(`loadAlerts ${type} error:`, dbError);
      error = `Impossible de charger les alertes ${type.toUpperCase()}.`;
      alerts = [];
    } else {
      alerts = data || [];
      // Prefetch stats equipes en batch pour eviter N+1
      prefetchTeamStats(alerts);
    }
    loading = false;
  }

  let availableLeagues = $derived([...new Set(alerts.map(a => a.league_name).filter(Boolean))].sort());
  const CONF_ORDER = { fort: 0, moyen: 1 };

  function matchesConfidence(alert) {
    if (alert.algo_version === 'manual') return true;
    if (selectedConfs.size === 0) return true;
    return selectedConfs.has(alert.confidence);
  }

  function toggleConf(val) {
    const s = new Set(selectedConfs);
    if (s.has(val)) s.delete(val); else s.add(val);
    selectedConfs = s;
  }

  let alertsNoDay = $derived(
    alerts.filter(a => {
      if (selectedLeague !== 'toutes' && a.league_name !== selectedLeague) return false;
      if (!matchesConfidence(a)) return false;
      return true;
    })
  );

  let filteredAlerts = $derived(
    alerts
      .filter(a => {
        if (selectedDay !== null && a.match_date !== getDateStr(selectedDay)) return false;
        if (selectedLeague !== 'toutes' && a.league_name !== selectedLeague) return false;
        if (!matchesConfidence(a)) return false;
        return true;
      })
      .sort((a, b) => {
        if (a.match_date < b.match_date) return -1;
        if (a.match_date > b.match_date) return 1;
        const ca = CONF_ORDER[a.confidence] ?? 99;
        const cb = CONF_ORDER[b.confidence] ?? 99;
        if (ca !== cb) return ca - cb;
        return (a.kickoff_unix || 0) - (b.kickoff_unix || 0);
      })
  );

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

  let hoverBar = $state(null);

  /**
   * Cache preload des stats equipes : Map<teamId, {lg1_after30_pct, lg2_pct, matches_count}>
   * Alimente par prefetchTeamStats() apres chargement des alertes.
   * On garde la derniere saison connue par team_id (max updated_at).
   */
  let teamStatsCache = $state(new Map());

  async function prefetchTeamStats(alertsList) {
    if (alertsList.length === 0) return;
    const teamIds = new Set();
    for (const a of alertsList) {
      if (a.home_team_id) teamIds.add(a.home_team_id);
      if (a.away_team_id) teamIds.add(a.away_team_id);
    }
    const teamIdsArr = [...teamIds];
    if (teamIdsArr.length === 0) return;
    try {
      const { data, error } = await supabase
        .from('team_lg1_cache')
        .select('team_id, lg1_after30_pct, lg2_pct, matches_count, lg1_home_pct, lg1_away_pct, lg2_home_pct, lg2_away_pct, matches_home, matches_away, updated_at')
        .in('team_id', teamIdsArr)
        .order('updated_at', { ascending: false });
      if (error || !data) return;
      const newCache = new Map(teamStatsCache);
      // Premier hit par team_id = ligne la plus recente grace au order desc
      for (const row of data) {
        if (newCache.has(row.team_id)) continue;
        newCache.set(row.team_id, row);
      }
      teamStatsCache = newCache;
    } catch (e) {
      console.warn('prefetchTeamStats error:', e.message);
    }
  }

  function onBarMove(e, key) {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, (e.clientX - rect.left) / rect.width * 100));
    const min = Math.round(pct / 100 * 90);
    hoverBar = { key, pct, min };
  }

  function onBarLeave() {
    hoverBar = null;
  }

  onMount(() => {
    const params = new URLSearchParams(window.location.search);
    const dayParam = params.get('day');
    if (dayParam !== null) selectedDay = parseInt(dayParam);
    // loadAlerts() est déclenché par $effect sur `type`
  });
</script>

<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
  <div>
    <h1 class="page-title">{isLg1 ? '⚡' : '⏱️'} Sélection {type.toUpperCase()}</h1>
    <p class="page-subtitle">
      {alerts.length} signal{alerts.length > 1 ? 's' : ''} {type.toUpperCase()}{isLg1 ? '' : ' (but après 80\')'} — 3 derniers jours + à venir
    </p>
  </div>
  <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
    <button class="btn btn--secondary btn--sm" onclick={handleGenerate} disabled={generating}>
      {generating ? '⏳...' : '🔄 Actualiser'}
    </button>
    {#if filteredAlerts.length > 0}
      <button class="btn btn--danger btn--sm" onclick={handleDeleteVisible} disabled={deleting}>
        {deleting ? '⏳...' : `Supprimer les ${filteredAlerts.length} visible${filteredAlerts.length > 1 ? 's' : ''}`}
      </button>
    {/if}
  </div>
</div>

<!-- Tabs LG1 / LG2 -->
<div class="alerts-tabs">
  <a
    href="/alerts/lg1"
    class="alerts-tab"
    class:active={type === 'lg1'}
    onclick={(e) => { e.preventDefault(); goto('/alerts/lg1'); }}
  >
    ⚡ LG1
  </a>
  <a
    href="/alerts/lg2"
    class="alerts-tab"
    class:active={type === 'lg2'}
    onclick={(e) => { e.preventDefault(); goto('/alerts/lg2'); }}
  >
    ⏱️ LG2
  </a>
</div>

{#if genMessage}
  <div style="font-size:12px;padding:6px 12px;margin-bottom:8px;border-radius:6px;background:rgba(255,255,255,0.04);color:var(--color-text-muted);">{genMessage}</div>
{/if}
{#if deleteMessage}
  <div style="font-size:12px;padding:6px 12px;margin-bottom:8px;border-radius:6px;background:rgba(226,75,74,0.08);color:var(--color-danger);">{deleteMessage}</div>
{/if}

<div class="alerts-filters">
  <button class="alerts-filter-btn" class:active={selectedDay === null} aria-pressed={selectedDay === null} onclick={() => selectedDay = null}>
    Tous ({alertsNoDay.length})
  </button>
  {#each days as day}
    {@const count = alertsNoDay.filter(a => a.match_date === getDateStr(day.offset)).length}
    <button class="alerts-filter-btn" class:active={selectedDay === day.offset} aria-pressed={selectedDay === day.offset} onclick={() => selectedDay = (selectedDay === day.offset ? null : day.offset)}>
      {day.label} ({count})
    </button>
  {/each}
</div>

<div class="alerts-sub-filters">
  <div class="sub-filter-group">
    <span class="sub-filter-label">Ligue</span>
    <select class="alerts-filter-select" bind:value={selectedLeague}>
      <option value="toutes">Toutes</option>
      {#each availableLeagues as league}
        {@const count = alerts.filter(a => a.league_name === league && (selectedDay === null || a.match_date === getDateStr(selectedDay))).length}
        <option value={league}>{league} ({count})</option>
      {/each}
    </select>
  </div>
  <div class="sub-filter-group">
    <span class="sub-filter-label">Confiance</span>
    <div class="conf-btns">
      <button class="alerts-filter-btn" class:active={selectedConfs.size === 0} onclick={() => selectedConfs = new Set()}>Tout</button>
      <button class="alerts-filter-btn" class:active={selectedConfs.has('fort')} onclick={() => toggleConf('fort')}>Fort</button>
      <button class="alerts-filter-btn" class:active={selectedConfs.has('moyen')} onclick={() => toggleConf('moyen')}>Moyen</button>
    </div>
  </div>
  </div>

{#if error}
  <p class="error-msg">{error}</p>
{/if}

{#if loading}
  <div class="empty-state" style="padding:40px;">
    <div class="empty-state__icon">⏳</div>
    <div class="empty-state__title">Chargement des alertes {type.toUpperCase()}...</div>
  </div>
{:else if filteredAlerts.length === 0}
  <div class="empty-state" style="padding:40px;">
    <div class="empty-state__icon">🔔</div>
    <div class="empty-state__title">Aucune alerte {type.toUpperCase()}</div>
    <div style="font-size:12px;color:var(--color-text-muted);margin-top:8px;">
      Les alertes sont générées automatiquement toutes les 12h
    </div>
    <button class="btn btn--primary" style="margin-top:12px;" onclick={handleGenerate} disabled={generating}>
      {generating ? '⏳ Analyse en cours...' : `${isLg1 ? '⚡' : '⏱️'} Lancer l'analyse ${type.toUpperCase()} maintenant`}
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
      >
        <div class="alert-card__header" onclick={() => toggleExpand(a)} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpand(a); } }} role="button" tabindex="0" aria-expanded={expandedId === a.id}>
          <div class="alert-card__time">
            <div class="alert-card__day">{formatDateDMY(a.match_date)}</div>
            <div class="alert-card__hour">{formatTime(a.kickoff_unix)}</div>
          </div>
          <div class="alert-card__match">
            <div class="alert-card__teams-row">
              <span class="alert-card__teams">{a.home_team_name} vs {a.away_team_name}</span>
              {#if a.algo_version === 'manual'}
                <span class="alert-badge alert-badge--manuel">Manuel</span>
              {:else}
                <span class="alert-badge alert-badge--inline {confidenceClass(a.confidence)}">{a.confidence}</span>
              {/if}
            </div>
            <div class="alert-card__league">
              {#if leagueFlagUrl(a.league_name)}
                <img class="country-flag" src={leagueFlagUrl(a.league_name)} alt="" loading="lazy" />
              {/if}
              {a.league_name || '—'}
            </div>
            {#if a.home_team_id && a.away_team_id}
              <div class="alert-card__team-badges">
                <div class="alert-card__team-badge-row">
                  <span class="alert-card__team-label">{a.home_team_name}</span>
                  <TeamLgBadges
                    teamId={a.home_team_id}
                    context="home"
                    size="sm"
                    inline
                    preload={teamStatsCache.get(a.home_team_id) ?? null}
                  />
                </div>
                <div class="alert-card__team-badge-row">
                  <span class="alert-card__team-label">{a.away_team_name}</span>
                  <TeamLgBadges
                    teamId={a.away_team_id}
                    context="away"
                    size="sm"
                    inline
                    preload={teamStatsCache.get(a.away_team_id) ?? null}
                  />
                </div>
              </div>
            {/if}
          </div>
          <div class="alert-card__actions">
            <SelectAlertButton alert={a} />
          </div>
          <span class="alert-card__arrow">{expandedId === a.id ? '▼' : '▶'}</span>
        </div>

        {#if expandedId === a.id}
          {@const homeMatches = getTeamMatches(a.home_team_id, 'home')}
          {@const awayMatches = getTeamMatches(a.away_team_id, 'away')}
          <div class="alert-expand">
            <div class="team-detail">
              <div class="team-detail__header">
                <span class="team-detail__name">{a.home_team_name}</span>
                <span class="team-detail__context">Domicile</span>
              </div>
              {#if homeMatches.length > 0}
                <div class="team-matches">
                  {#each homeMatches as m, i}
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
                          <span class="goal-bar__marker" style="left:33%">30'</span>
                          <span class="goal-bar__marker" style="left:50%">HT</span>
                          {#if !isLg1}
                            <span class="goal-bar__marker" style="left:89%">80'</span>
                          {/if}
                          <span class="goal-bar__marker" style="left:98%">FT</span>
                          {#if hoverBar?.key === barKey}
                            <div class="goal-cursor" style="left:{hoverBar.pct}%"></div>
                          {/if}
                          {#if hoverBar?.key === barKey && i === 0}
                            <span class="bar-hover-min" style="position:absolute;bottom:calc(100% + 4px);left:{hoverBar.pct}%;transform:translateX(-50%);z-index:10;">{hoverBar.min}'</span>
                          {/if}
                          {#each bar.goals as g}
                            <span class="goal-dot" class:goal-dot--conceded={!g.scored} style="left:{g.pct}%" data-tip="{g.label || g.min + '\''}"></span>
                          {/each}
                        </div>
                      </div>
                    </div>
                  {/each}
                </div>
              {:else}
                <p style="color:var(--color-text-muted);text-align:center;padding:1rem;font-size:13px;">Aucun match joué cette saison</p>
              {/if}
            </div>

            <div class="team-detail">
              <div class="team-detail__header">
                <span class="team-detail__name">{a.away_team_name}</span>
                <span class="team-detail__context">Extérieur</span>
              </div>
              {#if awayMatches.length > 0}
                <div class="team-matches">
                  {#each awayMatches as m, i}
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
                          <span class="goal-bar__marker" style="left:33%">30'</span>
                          <span class="goal-bar__marker" style="left:50%">HT</span>
                          {#if !isLg1}
                            <span class="goal-bar__marker" style="left:89%">80'</span>
                          {/if}
                          <span class="goal-bar__marker" style="left:98%">FT</span>
                          {#if hoverBar?.key === barKey}
                            <div class="goal-cursor" style="left:{hoverBar.pct}%"></div>
                          {/if}
                          {#if hoverBar?.key === barKey && i === 0}
                            <span class="bar-hover-min" style="position:absolute;bottom:calc(100% + 4px);left:{hoverBar.pct}%;transform:translateX(-50%);z-index:10;">{hoverBar.min}'</span>
                          {/if}
                          {#each bar.goals as g}
                            <span class="goal-dot" class:goal-dot--conceded={!g.scored} style="left:{g.pct}%" data-tip="{g.label || g.min + '\''}"></span>
                          {/each}
                        </div>
                      </div>
                    </div>
                  {/each}
                </div>
              {:else}
                <p style="color:var(--color-text-muted);text-align:center;padding:1rem;font-size:13px;">Aucun match joué cette saison</p>
              {/if}
            </div>
          </div>
        {/if}
      </div>
    {/each}
  </div>
{/if}

<style>
  /* Tabs LG1 / LG2 */
  .alerts-tabs {
    display: flex;
    gap: 4px;
    margin-bottom: 14px;
    border-bottom: 1px solid var(--color-border);
    padding-bottom: 0;
  }
  .alerts-tab {
    padding: 7px 18px;
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text-muted);
    text-decoration: none;
    border-radius: 6px 6px 0 0;
    border: 1px solid transparent;
    border-bottom: none;
    transition: all 0.15s;
    cursor: pointer;
    background: transparent;
  }
  .alerts-tab:hover {
    color: var(--color-text-primary);
    background: rgba(255,255,255,0.04);
  }
  .alerts-tab.active {
    color: var(--color-accent-blue);
    background: var(--color-bg-card);
    border-color: var(--color-border);
    border-bottom-color: var(--color-bg-card);
    margin-bottom: -1px;
  }

  .alerts-filters { display: flex; gap: 4px; margin-bottom: 10px; flex-wrap: wrap; }
  .alerts-filter-btn { background: rgba(255,255,255,0.05); border: 1px solid var(--color-border); border-radius: 6px; padding: 5px 12px; font-size: 12px; color: var(--color-text-muted); cursor: pointer; transition: all 0.15s; }
  .alerts-filter-btn.active { background: var(--color-accent-blue); border-color: var(--color-accent-blue); color: white; }

  .alerts-sub-filters { display: flex; gap: 14px; margin-bottom: 16px; flex-wrap: wrap; align-items: center; padding: 8px 12px; background: var(--color-bg-card); border: 1px solid var(--color-border); border-radius: 8px; }
  .conf-btns { display: flex; gap: 4px; flex-wrap: wrap; }
  .sub-filter-group { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
  .sub-filter-label { font-size: 11px; color: var(--color-text-muted); font-weight: 500; white-space: nowrap; }
  .alerts-filter-select { background: rgba(255,255,255,0.05); border: 1px solid var(--color-border); border-radius: 6px; padding: 4px 8px; font-size: 12px; color: var(--color-text-muted); cursor: pointer; max-width: 220px; }
  .alerts-list { display: flex; flex-direction: column; gap: 8px; }

  .alert-card { background: var(--color-bg-card); border: 1px solid var(--color-border); border-radius: 10px; overflow: hidden; transition: border-color 0.2s; }
  .alert-card:hover { border-color: var(--color-accent-blue); }
  .alert-card--expanded { border-color: var(--color-accent-blue); }

  .alert-card__header { display: flex; align-items: center; gap: 14px; padding: 12px 16px; cursor: pointer; transition: background 0.15s; }
  .alert-card__header:hover { background: rgba(255,255,255,0.02); }

  .alert-card__time { min-width: 65px; text-align: center; }
  .alert-card__day { font-size: 10px; color: var(--color-text-muted); }
  .alert-card__hour { font-size: 14px; font-weight: 600; }
  .alert-card__match { flex: 1; min-width: 0; }
  .alert-card__teams { font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .alert-card__league { font-size: 11px; color: var(--color-text-muted); margin-top: 2px; display: flex; align-items: center; gap: 6px; }
  .alert-card__league .country-flag { width: 16px; height: 12px; object-fit: cover; border-radius: 2px; box-shadow: 0 0 0 1px rgba(255,255,255,0.08); flex-shrink: 0; }
  .alert-card__teams-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .alert-card__teams { font-size: 13px; font-weight: 500; min-width: 0; flex: 1 1 auto; }
  .alert-card__team-badges { margin-top: 5px; display: flex; flex-direction: column; gap: 3px; }
  .alert-card__team-badge-row { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
  .alert-card__team-label { font-size: 10px; color: var(--color-text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 110px; flex-shrink: 0; }
  .alert-card__arrow { font-size: 11px; color: var(--color-text-muted); flex-shrink: 0; }

  .alert-card__actions { display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .alert-badge--inline { font-size: 10px; padding: 2px 6px; flex-shrink: 0; }
  .alert-badge--manuel { background: rgba(120,100,200,0.15); color: #a090d0; border: 1px solid rgba(120,100,200,0.35); }

  /* Expand */
  .alert-expand { border-top: 1px solid var(--color-border); padding: 16px; display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }

  @media (max-width: 1200px) {
    .alert-expand { grid-template-columns: 1fr; }
  }
  @media (max-width: 768px) {
    .alert-card__header {
      display: grid;
      grid-template-columns: auto 1fr auto;
      grid-template-areas:
        "time match arrow"
        "actions actions actions";
      align-items: start;
      gap: 8px 12px;
      padding: 12px;
    }
    .alert-card__time { grid-area: time; text-align: left; min-width: 0; }
    .alert-card__match { grid-area: match; min-width: 0; }
    .alert-card__teams { white-space: normal; line-height: 1.3; }
    .alert-card__teams-row { gap: 6px; }
    .alert-card__arrow { grid-area: arrow; align-self: start; padding-top: 4px; }
    .alert-card__actions {
      grid-area: actions;
      width: 100%;
      justify-content: center;
      border-top: 1px solid var(--color-border);
      padding-top: 10px;
    }
    .alert-card__team-label { max-width: 90px; font-size: 11px; }
  }
</style>

