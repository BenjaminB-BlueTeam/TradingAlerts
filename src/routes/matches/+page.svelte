<script>
  import { onMount } from 'svelte';
  import { leagues } from '$lib/stores/appStore.js';
  import { getTodaysMatches, getAllLeagues } from '$lib/api/footystats.js';
  import { supabase } from '$lib/api/supabase.js';
  import { getDateStr, formatDate, formatTime, fhgColor } from '$lib/utils/formatters.js';
  import { loadTeamMatches as _loadTeamMatches, computeTeamStats, goalBar } from '$lib/utils/teamData.js';

  let filtrePlage = $state(0);
  let filtreLigue = $state('toutes');
  let allMatches = $state([]);
  let loading = $state(false);
  let error = $state('');
  let leagueNames = $state({}); // competition_id -> nom de la ligue
  let expandedId = $state(null);
  let teamMatchesCache = $state({});

  let activeLeagues = $derived($leagues.filter(l => l.active));

  function getLeagueName(m) {
    const compId = m.competition_id || m.league_id;
    return leagueNames[compId] || m.competition_name || m.league_name || '\u2014';
  }

  // Filtrage r\u00e9actif : exclure termin\u00e9s et en cours + filtre ligue
  let filteredMatches = $derived(allMatches.filter(m => {
    const status = (m.status || '').toLowerCase();
    if (status === 'complete' || status === 'finished') return false;
    if (m.date_unix && m.date_unix * 1000 < Date.now()) return false;
    if (filtreLigue === 'toutes') return true;
    const matchLeague = getLeagueName(m);
    return matchLeague.includes(filtreLigue) || filtreLigue.includes(matchLeague);
  }).sort((a, b) => (a.date_unix || 0) - (b.date_unix || 0)));

  function formatDateUnix(unix) {
    if (!unix) return '';
    return new Date(unix * 1000).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
  }


  async function loadMatches(plage) {
    loading = true;
    error = '';
    const offsets = plage === -1 ? [0, 1, 2] : [plage];
    const results = [];
    for (const offset of offsets) {
      try {
        const dateStr = getDateStr(offset);
        const matches = await getTodaysMatches(dateStr);
        if (Array.isArray(matches)) results.push(...matches);
      } catch (e) {
        console.error('loadMatches error:', e);
        error = 'Impossible de charger les matchs.';
      }
    }
    allMatches = results;
    loading = false;
  }

  // Recharger quand la plage change
  $effect(() => { loadMatches(filtrePlage); });

  async function loadLeagueNames() {
    try {
      const leagues = await getAllLeagues();
      for (const l of leagues) {
        if (l.id) leagueNames[l.id] = l.name;
        if (l.seasons) {
          for (const s of l.seasons) {
            leagueNames[s.id] = l.name;
          }
        }
      }
      leagueNames = leagueNames;
    } catch (e) {
      console.warn('Matches: erreur chargement noms de ligues', e);
    }
  }

  // Charger les derniers matchs d'une \u00e9quipe dans son contexte
  async function loadTeamMatches(teamId, context) {
    const key = `${teamId}_${context}`;
    if (teamMatchesCache[key]) return teamMatchesCache[key];

    const data = await _loadTeamMatches(teamId, context, supabase);
    teamMatchesCache[key] = data;
    teamMatchesCache = teamMatchesCache;
    return data;
  }

  async function toggleExpand(match) {
    const id = match.id;
    if (expandedId === id) {
      expandedId = null;
      return;
    }
    if (match.homeID && match.awayID) {
      await Promise.all([
        loadTeamMatches(match.homeID, 'home'),
        loadTeamMatches(match.awayID, 'away'),
      ]);
    }
    expandedId = id;
  }

  function getTeamMatches(teamId, context) {
    return teamMatchesCache[`${teamId}_${context}`] || [];
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

  onMount(() => {
    loadLeagueNames();
  });
</script>

<h1 class="page-title">⚽ Matchs à venir</h1>
<p class="page-subtitle">
  {filteredMatches.length} match{filteredMatches.length > 1 ? 's' : ''} trouvés
</p>

<!-- FILTERS BAR -->
<div class="filters-bar">
  <select class="filter-select" bind:value={filtrePlage}>
    <option value={0}>Aujourd'hui</option>
    <option value={1}>Demain</option>
    <option value={2}>Après-demain</option>
    <option value={-1}>3 jours</option>
  </select>

  <select class="filter-select filter-select--league" bind:value={filtreLigue}>
    <option value="toutes">Toutes les ligues</option>
    {#each activeLeagues as l}
      <option value={l.name}>{l.name}</option>
    {/each}
  </select>

  {#if loading}
    <span style="font-size:12px;color:var(--color-text-muted);">⏳ Chargement...</span>
  {/if}
</div>

{#if error}
  <p class="error-msg">{error}</p>
{/if}

<!-- LISTE -->
{#if loading}
  <div class="empty-state">
    <div class="empty-state__icon">⏳</div>
    <div class="empty-state__title">Chargement des matchs...</div>
  </div>
{:else if filteredMatches.length > 0}
  <div class="matches-list">
    {#each filteredMatches as m (m.id)}
      <div class="match-card" class:match-card--expanded={expandedId === m.id}>
        <div class="match-card__header" onclick={() => toggleExpand(m)} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpand(m); } }} role="button" tabindex="0" aria-expanded={expandedId === m.id}>
          <div class="match-card__time">
            <div class="match-card__day">{formatDateUnix(m.date_unix)}</div>
            <div class="match-card__hour">{formatTime(m.date_unix)}</div>
          </div>
          <div class="match-card__match">
            <div class="match-card__teams">{m.home_name || '?'} - {m.away_name || '?'}</div>
            <div class="match-card__league">{getLeagueName(m)}</div>
          </div>
          <span class="match-card__arrow">{expandedId === m.id ? '▼' : '▶'}</span>
        </div>

        {#if expandedId === m.id}
          {@const homeMatches = getTeamMatches(m.homeID, 'home')}
          {@const homeStats = computeTeamStats(homeMatches, 'home')}
          {@const awayMatches = getTeamMatches(m.awayID, 'away')}
          {@const awayStats = computeTeamStats(awayMatches, 'away')}
          <div class="match-expand">
            <!-- Équipe domicile -->
            <div class="team-detail">
              <div class="team-detail__header">
                <span class="team-detail__name">{m.home_name || '?'}</span>
                <span class="team-detail__context">Domicile</span>
                {#if hoverBar?.key === `${m.id}_home`}
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
                  {#each homeMatches as hm}
                    {@const bar = goalBar(hm, 'home')}
                    {@const barKey = `${m.id}_home`}
                    <div class="match-row">
                      <span class="match-row__date">{formatDate(hm.match_date)}</span>
                      <span class="match-row__home match-row__bold">{hm.home_team_name}</span>
                      <span class="match-row__score match-row__score--{bar.result}">{hm.home_goals}-{hm.away_goals}</span>
                      <span class="match-row__away">{hm.away_team_name}</span>
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

            <!-- Équipe extérieure -->
            <div class="team-detail">
              <div class="team-detail__header">
                <span class="team-detail__name">{m.away_name || '?'}</span>
                <span class="team-detail__context">Extérieur</span>
                {#if hoverBar?.key === `${m.id}_away`}
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
                  {#each awayMatches as am}
                    {@const bar = goalBar(am, 'away')}
                    {@const barKey = `${m.id}_away`}
                    <div class="match-row">
                      <span class="match-row__date">{formatDate(am.match_date)}</span>
                      <span class="match-row__home">{am.home_team_name}</span>
                      <span class="match-row__score match-row__score--{bar.result}">{am.home_goals}-{am.away_goals}</span>
                      <span class="match-row__away match-row__bold">{am.away_team_name}</span>
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
{:else}
  <div class="empty-state">
    <div class="empty-state__icon">⚽</div>
    <div class="empty-state__title">Aucun match trouvé</div>
    <div class="empty-state__desc">Changez la date ou la ligue</div>
  </div>
{/if}

<style>
  .matches-list { display: flex; flex-direction: column; gap: 6px; }

  .match-card { background: var(--color-bg-card); border: 1px solid var(--color-border); border-radius: 10px; overflow: hidden; transition: border-color 0.2s; }
  .match-card:hover { border-color: var(--color-accent-blue); }
  .match-card--expanded { border-color: var(--color-accent-blue); }

  .match-card__header { display: flex; align-items: center; gap: 14px; padding: 10px 16px; cursor: pointer; transition: background 0.15s; }
  .match-card__header:hover { background: rgba(255,255,255,0.02); }

  .match-card__time { min-width: 55px; text-align: center; flex-shrink: 0; }
  .match-card__day { font-size: 10px; color: var(--color-text-muted); }
  .match-card__hour { font-size: 14px; font-weight: 600; }
  .match-card__match { flex: 1; min-width: 0; }
  .match-card__teams { font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .match-card__league { font-size: 11px; color: var(--color-text-muted); margin-top: 2px; }
  .match-card__arrow { font-size: 11px; color: var(--color-text-muted); flex-shrink: 0; }

  /* Expand */
  .match-expand { border-top: 1px solid var(--color-border); padding: 16px; display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }

  @media (max-width: 1200px) {
    .match-expand { grid-template-columns: 1fr; }
  }
  @media (max-width: 768px) {
    .match-card__header { flex-wrap: wrap; }
  }
</style>
