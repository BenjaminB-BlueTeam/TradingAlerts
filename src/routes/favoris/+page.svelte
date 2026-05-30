<script>
  import { supabase } from '$lib/api/supabase.js';
  import { favoriteTeams, addFavorite, removeFavorite } from '$lib/stores/favoritesStore.js';
  import { loadTeamMatches as _loadTeamMatches, goalBar } from '$lib/utils/teamData.js';
  import FavoriteStarButton from '$lib/components/FavoriteStarButton.svelte';
  import TeamLgBadges from '$lib/components/TeamLgBadges.svelte';

  // ---- Recherche autocomplete ----
  let teamSearch = $state('');
  let teamSuggestions = $state([]);
  let searchError = $state('');
  let searchDebounce;
  let addPending = $state(false);

  let showSuggestions = $derived(
    teamSearch.trim().length >= 2 && teamSuggestions.length > 0
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
      console.error('[favoris] team autocomplete error:', error);
      searchError = 'Recherche indisponible : ' + (error.message || error.code || 'erreur inconnue');
      teamSuggestions = [];
      return;
    }
    searchError = '';
    teamSuggestions = (data || []).map(t => ({ id: t.team_id, name: t.name }));
  }

  function onSearchInput(e) {
    teamSearch = e.target.value;
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => runSearch(teamSearch), 200);
  }

  async function selectSuggestion(team) {
    teamSearch = '';
    teamSuggestions = [];
    searchError = '';
    addPending = true;
    try {
      await addFavorite(team.id, team.name);
    } catch (err) {
      console.error('Ajout favori:', err);
      searchError = "Impossible d'ajouter ce favori.";
    } finally {
      addPending = false;
    }
  }

  function clearSearch() {
    teamSearch = '';
    teamSuggestions = [];
    searchError = '';
  }

  // ---- Expand / historique par équipe ----
  let expandedTeamId = $state(null);
  let teamMatchesCache = $state({});
  let hoverBar = $state(null); // { key, pct, min }

  async function loadTeamMatches(teamId, context) {
    const key = `${teamId}_${context}`;
    if (teamMatchesCache[key]) return;
    const data = await _loadTeamMatches(teamId, context, supabase);
    teamMatchesCache[key] = data;
    teamMatchesCache = teamMatchesCache;
  }

  function getTeamMatches(teamId, context) {
    return teamMatchesCache[`${teamId}_${context}`] || null;
  }

  async function toggleExpand(teamId) {
    if (expandedTeamId === teamId) {
      expandedTeamId = null;
      return;
    }
    // Charger les deux contextes en parallèle
    await Promise.all([
      loadTeamMatches(teamId, 'home'),
      loadTeamMatches(teamId, 'away'),
    ]);
    expandedTeamId = teamId;
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
</script>

<h1 class="page-title">Equipes favorites</h1>
<p class="page-subtitle">
  {$favoriteTeams.length} équipe{$favoriteTeams.length > 1 ? 's' : ''} favorite{$favoriteTeams.length > 1 ? 's' : ''}
</p>

<!-- RECHERCHE AJOUT -->
<div class="fav-search-section">
  <div class="fav-search-wrapper">
    <label class="fav-search-label" for="fav-search-input">Ajouter une équipe aux favoris</label>
    <div class="fav-search-row">
      <div class="team-search-wrapper">
        <input
          id="fav-search-input"
          type="text"
          class="filter-select team-search-input"
          placeholder="Rechercher une équipe…"
          value={teamSearch}
          oninput={onSearchInput}
          onkeydown={(e) => { if (e.key === 'Escape') clearSearch(); }}
          disabled={addPending}
        />
        {#if teamSearch}
          <button class="team-search-clear" onclick={clearSearch} title="Effacer">✕</button>
        {/if}
        {#if showSuggestions}
          <div class="team-suggestions">
            {#each teamSuggestions as t (t.id)}
              {@const alreadyFav = $favoriteTeams.some(f => Number(f.team_id) === Number(t.id))}
              <button
                class="team-suggestion-item"
                class:team-suggestion-item--already={alreadyFav}
                onmousedown={(e) => { e.preventDefault(); if (!alreadyFav) selectSuggestion(t); }}
                disabled={alreadyFav}
              >
                {t.name}
                {#if alreadyFav}
                  <span class="already-fav-hint">★ déjà favori</span>
                {/if}
              </button>
            {/each}
          </div>
        {/if}
        {#if searchError}
          <div class="team-suggestions team-suggestions--error">{searchError}</div>
        {/if}
      </div>
      {#if addPending}
        <span class="add-pending">⏳ Ajout...</span>
      {/if}
    </div>
  </div>
</div>

<!-- LISTE DES FAVORIS -->
{#if $favoriteTeams.length === 0}
  <div class="empty-state">
    <div class="empty-state__icon">🌟</div>
    <div class="empty-state__title">Aucune équipe favorite</div>
    <div class="empty-state__desc">Recherche une équipe ci-dessus pour l'ajouter.</div>
  </div>
{:else}
  <div class="fav-list">
    {#each $favoriteTeams as fav (fav.team_id)}
      {@const isExpanded = expandedTeamId === fav.team_id}
      {@const homeMatches = getTeamMatches(fav.team_id, 'home')}
      {@const awayMatches = getTeamMatches(fav.team_id, 'away')}

      <div class="fav-card" class:fav-card--expanded={isExpanded}>
        <!-- EN-TÊTE DE LA CARD -->
        <div
          class="fav-card__header"
          onclick={() => toggleExpand(fav.team_id)}
          onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpand(fav.team_id); } }}
          role="button"
          tabindex="0"
          aria-expanded={isExpanded}
        >
          <span class="fav-card__name">{fav.team_name || '—'}</span>
          <div class="fav-card__badges">
            <TeamLgBadges teamId={fav.team_id} size="sm" inline />
          </div>
          <FavoriteStarButton teamId={fav.team_id} teamName={fav.team_name} size="sm" />
          <span class="fav-card__arrow">{isExpanded ? '▼' : '▶'}</span>
        </div>

        <!-- HISTORIQUE EXPAND -->
        {#if isExpanded}
          <div class="fav-card__expand">
            {#if homeMatches === null || awayMatches === null}
              <div class="fav-expand__loading">⏳ Chargement de l'historique...</div>
            {:else}
              <!-- Colonne domicile -->
              <div class="team-detail">
                <div class="team-detail__header">
                  <span class="team-detail__name">{fav.team_name || '—'}</span>
                  <span class="team-detail__context">Domicile</span>
                  <TeamLgBadges teamId={fav.team_id} context="home" size="sm" inline />
                  <div class="team-detail__summary">
                    <span><strong>{homeMatches.length}</strong> matchs</span>
                  </div>
                </div>
                {#if homeMatches.length > 0}
                  <div class="team-matches">
                    {#each homeMatches as m, i (m.id ?? m.match_id)}
                      {@const bar = goalBar(m, 'home')}
                      {@const barKey = `fav_${fav.team_id}_home_${i}`}
                      <div class="match-row">
                        <span class="match-row__date">{m.match_date ? m.match_date.slice(8,10)+'/'+m.match_date.slice(5,7) : '—'}</span>
                        <span class="match-row__home match-row__bold">{m.home_team_name}</span>
                        <span class="match-row__score match-row__score--{bar.result}">{m.home_goals}-{m.away_goals}</span>
                        <span class="match-row__away">{m.away_team_name}</span>
                        <div class="match-row__bar">
                          <div
                            class="goal-bar"
                            onmousemove={(e) => onBarMove(e, barKey)}
                            onmouseleave={onBarLeave}
                          >
                            <span class="goal-bar__marker" style="left:33%">30'</span>
                            <span class="goal-bar__marker" style="left:50%">HT</span>
                            <span class="goal-bar__marker" style="left:98%">FT</span>
                            {#if hoverBar?.key === barKey}
                              <div class="goal-cursor" style="left:{hoverBar.pct}%"></div>
                            {/if}
                            {#each bar.goals as g}
                              <span
                                class="goal-dot"
                                class:goal-dot--conceded={!g.scored}
                                style="left:{g.pct}%"
                                data-tip="{g.label || g.min + '\''}"
                              ></span>
                            {/each}
                          </div>
                        </div>
                      </div>
                    {/each}
                  </div>
                {:else}
                  <p class="team-detail__empty">Aucun match joué cette saison</p>
                {/if}
              </div>

              <!-- Colonne extérieur -->
              <div class="team-detail">
                <div class="team-detail__header">
                  <span class="team-detail__name">{fav.team_name || '—'}</span>
                  <span class="team-detail__context">Extérieur</span>
                  <TeamLgBadges teamId={fav.team_id} context="away" size="sm" inline />
                  <div class="team-detail__summary">
                    <span><strong>{awayMatches.length}</strong> matchs</span>
                  </div>
                </div>
                {#if awayMatches.length > 0}
                  <div class="team-matches">
                    {#each awayMatches as m, i (m.id ?? m.match_id)}
                      {@const bar = goalBar(m, 'away')}
                      {@const barKey = `fav_${fav.team_id}_away_${i}`}
                      <div class="match-row">
                        <span class="match-row__date">{m.match_date ? m.match_date.slice(8,10)+'/'+m.match_date.slice(5,7) : '—'}</span>
                        <span class="match-row__home">{m.home_team_name}</span>
                        <span class="match-row__score match-row__score--{bar.result}">{m.home_goals}-{m.away_goals}</span>
                        <span class="match-row__away match-row__bold">{m.away_team_name}</span>
                        <div class="match-row__bar">
                          <div
                            class="goal-bar"
                            onmousemove={(e) => onBarMove(e, barKey)}
                            onmouseleave={onBarLeave}
                          >
                            <span class="goal-bar__marker" style="left:33%">30'</span>
                            <span class="goal-bar__marker" style="left:50%">HT</span>
                            <span class="goal-bar__marker" style="left:98%">FT</span>
                            {#if hoverBar?.key === barKey}
                              <div class="goal-cursor" style="left:{hoverBar.pct}%"></div>
                            {/if}
                            {#each bar.goals as g}
                              <span
                                class="goal-dot"
                                class:goal-dot--conceded={!g.scored}
                                style="left:{g.pct}%"
                                data-tip="{g.label || g.min + '\''}"
                              ></span>
                            {/each}
                          </div>
                        </div>
                      </div>
                    {/each}
                  </div>
                {:else}
                  <p class="team-detail__empty">Aucun match joué cette saison</p>
                {/if}
              </div>
            {/if}
          </div>
        {/if}
      </div>
    {/each}
  </div>
{/if}

<style>
  /* Section recherche */
  .fav-search-section {
    margin-bottom: 24px;
  }

  .fav-search-wrapper {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .fav-search-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .fav-search-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .add-pending {
    font-size: 12px;
    color: var(--color-text-muted);
  }

  /* Indication déjà favori dans suggestion */
  .team-suggestion-item--already {
    opacity: 0.5;
    cursor: default;
  }

  .already-fav-hint {
    font-size: 10px;
    color: var(--color-favorite-gold);
    margin-left: 6px;
  }

  /* Liste des favoris */
  .fav-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  /* Card favori */
  .fav-card {
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-card);
    overflow: hidden;
    transition: border-color var(--transition-fast);
  }

  .fav-card:hover {
    border-color: var(--color-favorite-gold);
  }

  .fav-card--expanded {
    border-color: var(--color-favorite-gold);
  }

  .fav-card__header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    cursor: pointer;
    transition: background var(--transition-fast);
  }

  .fav-card__header:hover {
    background: rgba(212, 175, 55, 0.04);
  }

  .fav-card__name {
    font-size: 14px;
    font-weight: 600;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .fav-card__badges {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  .fav-card__arrow {
    font-size: 11px;
    color: var(--color-text-muted);
    flex-shrink: 0;
  }

  /* Expand 2 colonnes — même structure que /matches */
  .fav-card__expand {
    border-top: 1px solid var(--color-border);
    padding: 16px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }

  .fav-expand__loading {
    grid-column: 1 / -1;
    text-align: center;
    color: var(--color-text-muted);
    font-size: 13px;
    padding: 16px;
  }

  @media (max-width: 1100px) {
    .fav-card__expand {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 768px) {
    .fav-card__header {
      flex-wrap: wrap;
    }

    .fav-search-row {
      flex-direction: column;
      align-items: flex-start;
    }
  }

  /* Recherche — réutilise les classes de /matches */
  .team-search-wrapper {
    position: relative;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .team-search-input {
    min-width: 260px;
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

  .team-suggestion-item:hover:not(.team-suggestion-item--already) {
    background: rgba(255, 255, 255, 0.06);
    color: var(--color-favorite-gold);
  }

  .team-suggestions--error {
    padding: 8px 12px;
    color: var(--color-danger);
    font-size: 12px;
  }

  /* Filtre select (importé de app.css) */
  .filter-select {
    background: var(--color-bg-input);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-input);
    color: var(--color-text-primary);
    padding: 7px 12px;
    font-size: 13px;
    transition: border-color var(--transition-fast);
  }

  .filter-select:focus {
    border-color: var(--color-accent-blue);
  }
</style>
