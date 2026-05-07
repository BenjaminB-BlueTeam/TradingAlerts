<script>
  import { onMount } from 'svelte';
  import { leagues } from '$lib/stores/appStore.js';
  import { getTodaysMatches, getAllLeagues } from '$lib/api/footystats.js';
  import { supabase } from '$lib/api/supabase.js';
  import { getDateStr, formatDate, formatTime, addDays, dateLabelNav } from '$lib/utils/formatters.js';
  import { cacheGet, cacheSet } from '$lib/api/cache.js';
  import { loadTeamMatches as _loadTeamMatches, computeTeamStats, goalBar } from '$lib/utils/teamData.js';

  let currentDate = $state(getDateStr(0));
  const DATE_MIN = getDateStr(-1);
  const DATE_MAX = getDateStr(29);
  const TTL_MATCHES = 72 * 60 * 60 * 1000;

  function canGoBack() { return currentDate > DATE_MIN; }
  function canGoForward() { return currentDate < DATE_MAX; }
  function goBack() { if (canGoBack()) currentDate = addDays(currentDate, -1); }
  function goForward() { if (canGoForward()) currentDate = addDays(currentDate, 1); }
  function goToday() { currentDate = getDateStr(0); }

  let filtreLigue = $state('toutes');
  let allMatches = $state([]);
  let loading = $state(false);
  let error = $state('');
  let leagueNames = $state({}); // competition_id -> nom de la ligue
  let expandedId = $state(null);
  let teamMatchesCache = $state({});

  let activeLeagues = $derived($leagues);

  function getLeagueName(m) {
    const compId = m.competition_id || m.league_id;
    return leagueNames[compId] || m.competition_name || m.league_name || '\u2014';
  }

  // Filtrage r\u00e9actif : exclure termin\u00e9s et en cours + filtre ligue + filtre \u00e9quipe
  let filteredMatches = $derived(
    allMatches
      .filter(m => {
        const status = (m.status || '').toLowerCase();
        if (status === 'complete' || status === 'finished') return false;
        if (m.date_unix && m.date_unix * 1000 < Date.now()) return false;
        if (filtreLigue === 'toutes') return true;
        const matchLeague = getLeagueName(m);
        return matchLeague.includes(filtreLigue) || filtreLigue.includes(matchLeague);
      })
      .filter(m => !selectedTeam || m.homeID === selectedTeam.id || m.awayID === selectedTeam.id)
      .sort((a, b) => (a.date_unix || 0) - (b.date_unix || 0))
  );

  function formatDateUnix(unix) {
    if (!unix) return '';
    return new Date(unix * 1000).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
  }


  async function loadMatches(dateStr) {
    loading = true;
    error = '';

    const cacheKey = `todays-matches-${dateStr}`;
    const cached = cacheGet(cacheKey);
    if (cached) {
      allMatches = cached;
      loading = false;
      return;
    }

    try {
      const matches = await getTodaysMatches(dateStr);
      const results = Array.isArray(matches) ? matches : [];
      const seen = new Set();
      const unique = [];
      for (const m of results) {
        if (m.id && !seen.has(m.id)) { seen.add(m.id); unique.push(m); }
      }
      cacheSet(cacheKey, unique, TTL_MATCHES);
      allMatches = unique;
    } catch (e) {
      console.error('loadMatches error:', e);
      error = 'Impossible de charger les matchs.';
    }
    loading = false;
  }

  // Recharger quand la date change
  $effect(() => { loadMatches(currentDate); });

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

  // Recherche équipe avec autocomplete (table teams Supabase)
  let teamSearch = $state('');
  let selectedTeam = $state(null); // { id: number, name: string } | null
  let teamSuggestions = $state([]);
  let searchError = $state('');
  let searchDebounce;

  // Panneau équipe — matchs saison en cours
  let teamContext = $state('home');

  let teamMatches = $derived.by(() => {
    if (!selectedTeam) return [];
    return getTeamMatches(selectedTeam.id, teamContext);
  });

  $effect(() => {
    if (!selectedTeam) return;
    loadTeamMatches(selectedTeam.id, 'home');
    loadTeamMatches(selectedTeam.id, 'away');
  });

  function teamMatchOpponent(match, teamId) {
    const isHome = match.home_team_id === teamId;
    const opponent = isHome ? (match.away_team_name || '—') : (match.home_team_name || '—');
    const score = (match.home_goals !== undefined && match.away_goals !== undefined)
      ? (isHome ? `${match.home_goals}-${match.away_goals}` : `${match.away_goals}-${match.home_goals}`)
      : '—';
    return { isHome, opponent, score };
  }

  function hasGoal3145(match, isHome) {
    const events = Array.isArray(match.goal_events) ? match.goal_events : [];
    return events.some(e => e.min >= 31 && e.min <= 45 && e.home === isHome);
  }

  // La dropdown s'affiche dès qu'il y a des suggestions et que la query n'a pas
  // été matérialisée comme une sélection (selectedTeam null + texte ne matche pas
  // exactement le nom sélectionné). Pas de dépendance fragile à un focus state.
  let showSuggestions = $derived(
    !selectedTeam && teamSearch.trim().length >= 2 && teamSuggestions.length > 0
  );

  async function runSearch(q) {
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      teamSuggestions = [];
      searchError = '';
      return;
    }
    const { data, error } = await supabase
      .from('teams')
      .select('team_id, name')
      .ilike('name', `%${trimmed}%`)
      .limit(8);
    if (error) {
      console.error('[matches] team autocomplete error:', error);
      searchError = 'Recherche indisponible : ' + (error.message || error.code || 'erreur inconnue');
      teamSuggestions = [];
      return;
    }
    searchError = '';
    teamSuggestions = (data || []).map(t => ({ id: t.team_id, name: t.name }));
  }

  function onSearchInput(e) {
    teamSearch = e.target.value;
    if (selectedTeam && teamSearch !== selectedTeam.name) selectedTeam = null;
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => runSearch(teamSearch), 200);
  }

  function selectTeam(team) {
    selectedTeam = team;
    teamSearch = team.name;
    teamSuggestions = [];
  }

  function clearTeam() {
    selectedTeam = null;
    teamSearch = '';
    teamSuggestions = [];
    searchError = '';
  }

  let hoverBar = $state(null); // { key, pct, min }

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
    loadLeagueNames();
  });
</script>

<h1 class="page-title">⚽ Matchs à venir</h1>
<p class="page-subtitle">
  {filteredMatches.length} match{filteredMatches.length > 1 ? 's' : ''} trouvés
</p>

<!-- FILTERS BAR -->
<div class="filters-bar">
  <div class="date-nav">
    <button class="date-nav__arrow" onclick={goBack} disabled={!canGoBack()} aria-label="Jour précédent">‹</button>
    <button class="date-nav__label" onclick={goToday} title="Revenir à aujourd'hui">{dateLabelNav(currentDate)}</button>
    <button class="date-nav__arrow" onclick={goForward} disabled={!canGoForward()} aria-label="Jour suivant">›</button>
  </div>

  <select class="filter-select filter-select--league" bind:value={filtreLigue}>
    <option value="toutes">Toutes les ligues</option>
    {#each activeLeagues as l}
      <option value={l.name}>{l.name}</option>
    {/each}
  </select>

  <div class="team-search-wrapper">
    <input
      type="text"
      class="filter-select team-search-input"
      placeholder="Rechercher une équipe…"
      value={teamSearch}
      oninput={onSearchInput}
      onkeydown={(e) => { if (e.key === 'Escape') clearTeam(); }}
    />
    {#if teamSearch}
      <button class="team-search-clear" onclick={clearTeam} title="Effacer">✕</button>
    {/if}
    {#if showSuggestions}
      <div class="team-suggestions">
        {#each teamSuggestions as t}
          <button class="team-suggestion-item" onmousedown={(e) => { e.preventDefault(); selectTeam(t); }}>
            {t.name}
          </button>
        {/each}
      </div>
    {/if}
    {#if searchError}
      <div class="team-suggestions team-suggestions--error">{searchError}</div>
    {/if}
  </div>

  {#if loading}
    <span style="font-size:12px;color:var(--color-text-muted);">⏳ Chargement...</span>
  {/if}
</div>

{#if error}
  <p class="error-msg">{error}</p>
{/if}

{#if selectedTeam}
  <div class="team-panel">
    <div class="team-panel__header">
      <span class="team-panel__name">{selectedTeam.name}</span>
      <div class="team-panel__ctx-btns">
        <button class="ctx-btn" class:ctx-btn--active={teamContext === 'home'} onclick={() => teamContext = 'home'}>Domicile</button>
        <button class="ctx-btn" class:ctx-btn--active={teamContext === 'away'} onclick={() => teamContext = 'away'}>Extérieur</button>
      </div>
      <span class="team-panel__count">{teamMatches.length} match{teamMatches.length !== 1 ? 's' : ''}</span>
    </div>

    {#if teamMatches.length === 0}
      <div class="team-panel__empty">Aucun match en base pour ce contexte</div>
    {:else}
      <div class="team-panel__list">
        {#each teamMatches as m, i (m.id ?? m.match_id)}
          {@const info = teamMatchOpponent(m, selectedTeam.id)}
          {@const bar = goalBar(m, teamContext)}
          {@const barKey = `panel_${selectedTeam.id}_${teamContext}_${i}`}
          <div class="match-row">
            <span class="match-row__date">{m.match_date ? m.match_date.slice(8,10)+'/'+m.match_date.slice(5,7) : '—'}</span>
            {#if info.isHome}
              <span class="match-row__home match-row__bold">{m.home_team_name}</span>
              <span class="match-row__score match-row__score--{bar.result}">{info.score}</span>
              <span class="match-row__away">{info.opponent}</span>
            {:else}
              <span class="match-row__home">{info.opponent}</span>
              <span class="match-row__score match-row__score--{bar.result}">{info.score}</span>
              <span class="match-row__away match-row__bold">{m.away_team_name}</span>
            {/if}
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
    {/if}
  </div>
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
            <div class="match-card__teams">
              {m.home_name || '?'} - {m.away_name || '?'}
            </div>
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
              </div>
              {#if homeMatches.length > 0}
                <div class="team-matches">
                  {#each homeMatches as hm, i}
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
                <p style="color:var(--color-text-muted);text-align:center;padding:1rem;font-size:13px;">Aucun match joue cette saison</p>
              {/if}
            </div>

            <!-- Équipe extérieure -->
            <div class="team-detail">
              <div class="team-detail__header">
                <span class="team-detail__name">{m.away_name || '?'}</span>
                <span class="team-detail__context">Extérieur</span>
              </div>
              {#if awayMatches.length > 0}
                <div class="team-matches">
                  {#each awayMatches as am, i}
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
  .date-nav {
    display: flex;
    align-items: center;
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-card);
    overflow: hidden;
    flex-shrink: 0;
  }
  .date-nav__arrow {
    background: none;
    border: none;
    color: var(--color-text-secondary);
    cursor: pointer;
    font-size: 20px;
    line-height: 1;
    padding: 6px 12px;
    transition: background var(--transition-fast), color var(--transition-fast);
  }
  .date-nav__arrow:hover:not(:disabled) {
    background: rgba(255,255,255,0.06);
    color: var(--color-text-primary);
  }
  .date-nav__arrow:disabled { opacity: 0.3; cursor: default; }
  .date-nav__label {
    background: none;
    border: none;
    border-left: 1px solid var(--color-border);
    border-right: 1px solid var(--color-border);
    color: var(--color-text-primary);
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
    padding: 6px 16px;
    min-width: 120px;
    text-align: center;
    transition: background var(--transition-fast);
  }
  .date-nav__label:hover { background: rgba(255,255,255,0.04); }

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
  .match-card__teams { font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; gap: 4px; }
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

  /* Panneau équipe */
  .team-panel {
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-card);
    margin-bottom: 12px;
    overflow: hidden;
  }
  .team-panel__header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    border-bottom: 1px solid var(--color-border);
    flex-wrap: wrap;
  }
  .team-panel__name {
    font-size: 13px;
    font-weight: 700;
    color: var(--color-text-primary);
    flex: 1;
  }
  .team-panel__ctx-btns { display: flex; gap: 4px; }
  .ctx-btn {
    background: none;
    border: 1px solid var(--color-border);
    border-radius: 6px;
    color: var(--color-text-muted);
    cursor: pointer;
    font-size: 11px;
    font-weight: 600;
    padding: 3px 10px;
    transition: all var(--transition-fast);
  }
  .ctx-btn--active {
    background: rgba(29,158,117,0.15);
    border-color: rgba(29,158,117,0.5);
    color: var(--color-accent-green);
  }
  .team-panel__count { font-size: 11px; color: var(--color-text-muted); }
  .team-panel__empty { padding: 16px 14px; font-size: 12px; color: var(--color-text-muted); }
  .team-panel__list { max-height: 320px; overflow-y: auto; }
  .team-panel__list .match-row__bar { max-width: 260px; }

  /* Recherche équipe */
  .team-search-wrapper {
    position: relative;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .team-search-input {
    min-width: 200px;
  }

  .team-search-clear {
    background: none;
    border: none;
    color: var(--color-text-muted);
    cursor: pointer;
    font-size: 14px;
    padding: 0 4px;
    line-height: 1;
  }
  .team-search-clear:hover {
    color: var(--color-danger);
  }

  .team-suggestions {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    min-width: 100%;
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    box-shadow: var(--shadow-modal, 0 8px 24px rgba(0,0,0,0.4));
    z-index: 100;
    overflow: hidden;
  }

  .team-suggestion-item {
    display: block;
    width: 100%;
    text-align: left;
    padding: 8px 12px;
    background: none;
    border: none;
    color: var(--color-text-primary);
    font-size: 13px;
    cursor: pointer;
    white-space: nowrap;
  }
  .team-suggestion-item:hover {
    background: rgba(255, 255, 255, 0.06);
    color: var(--color-accent-blue);
  }

  .team-suggestions--error {
    padding: 8px 12px;
    color: var(--color-danger);
    font-size: 12px;
  }
</style>
