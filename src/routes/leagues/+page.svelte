<script>
  import { onMount } from 'svelte';
  import { leagues, saveLeagues, isDemo } from '$lib/stores/appStore.js';
  import { getAllLeagues, getLeagueTable, getLeagueSeason, rawApiCall, normalizeLeagues } from '$lib/api/footystats.js';

  let apiLeagues = [];
  let loading = true;
  let searchQuery = '';
  let expandedLeague = null;
  let leagueTable = null;
  let tableLoading = false;
  let loaded = false;

  // Stats par ligue (season_id → stats)
  let leagueStats = {};
  let statsLoading = {};

  async function loadLeagues() {
    if (loaded && apiLeagues.length > 10) return;
    loading = true;
    try {
      const res = await rawApiCall('league-list', { chosen_leagues_only: 'true' });
      if (res.status === 200) {
        apiLeagues = normalizeLeagues(res.data);
        loaded = true;
        // Charger les stats progressivement
        loadAllStats();
      } else {
        apiLeagues = await getAllLeagues();
      }
    } catch (e) {
      apiLeagues = await getAllLeagues();
    }
    loading = false;
  }

  async function loadAllStats() {
    // Charger les stats 3 par 3 pour ne pas spammer l'API
    for (let i = 0; i < apiLeagues.length; i += 3) {
      const batch = apiLeagues.slice(i, i + 3);
      await Promise.all(batch.map(l => loadLeagueStats(l.id)));
      if (i + 3 < apiLeagues.length) {
        await new Promise(r => setTimeout(r, 500));
      }
    }
  }

  async function loadLeagueStats(seasonId) {
    if (leagueStats[seasonId]) return;
    statsLoading[seasonId] = true;
    statsLoading = statsLoading;
    try {
      const stats = await getLeagueSeason(seasonId);
      if (stats) {
        leagueStats[seasonId] = stats;
        leagueStats = leagueStats;
      }
    } catch (e) {
      console.warn(`Stats ligue ${seasonId} ERREUR:`, e.message);
    }
    statsLoading[seasonId] = false;
    statsLoading = statsLoading;
  }

  $: if (!$isDemo && !loaded) loadLeagues();

  // Trouver l'entrée store correspondant à une ligue API
  function findStoreIndex(storeList, apiLeague) {
    return storeList.findIndex(l =>
      (l.leagueId && l.leagueId === apiLeague.id) ||
      l.name === apiLeague.name ||
      apiLeague.name.includes(l.name) ||
      l.name.includes(apiLeague.name)
    );
  }

  // Set réactif des season_id actifs (recalculé quand $leagues change)
  $: activeSeasonIds = new Set(
    apiLeagues
      .filter(l => {
        const idx = findStoreIndex($leagues, l);
        return idx > -1 && $leagues[idx].active;
      })
      .map(l => l.id)
  );

  $: activeCount = activeSeasonIds.size;

  $: filtered = searchQuery
    ? apiLeagues.filter(l =>
        l.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        l.country.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : apiLeagues;

  function setAll(activate) {
    const current = [...$leagues];
    for (const league of apiLeagues) {
      const idx = findStoreIndex(current, league);
      if (idx > -1) {
        current[idx] = { ...current[idx], active: activate, leagueId: league.id };
      } else {
        current.push({
          id: league.name.toLowerCase().replace(/\s+/g, '-'),
          name: league.name,
          country: league.country,
          flag: '',
          active: activate,
          leagueId: league.id,
        });
      }
    }
    saveLeagues(current);
  }

  function toggleLeague(league) {
    const current = [...$leagues];
    const idx = findStoreIndex(current, league);

    if (idx > -1) {
      current[idx] = { ...current[idx], active: !current[idx].active, leagueId: league.id };
    } else {
      current.push({
        id: league.name.toLowerCase().replace(/\s+/g, '-'),
        name: league.name,
        country: league.country,
        flag: '',
        active: true,
        leagueId: league.id,
      });
    }
    saveLeagues(current);
  }

  async function toggleExpand(seasonId) {
    if (expandedLeague === seasonId) {
      expandedLeague = null;
      leagueTable = null;
      return;
    }
    expandedLeague = seasonId;
    leagueTable = null;
    tableLoading = true;
    try {
      leagueTable = await getLeagueTable(seasonId);
    } catch (e) {
      leagueTable = [];
      if (window.showToast) window.showToast(`Erreur : ${e.message}`, 'error');
    }
    tableLoading = false;
  }

  function statColor(val, green, orange) {
    if (val >= green) return 'var(--color-accent-green)';
    if (val >= orange) return 'var(--color-signal-moyen)';
    return 'var(--color-text-muted)';
  }

  onMount(() => {
    loadLeagues();
  });
</script>

<div class="page-title">🏆 Ligues actives</div>
<div class="page-subtitle">
  {activeCount} ligue{activeCount > 1 ? 's' : ''} active{activeCount > 1 ? 's' : ''} sur {apiLeagues.length} disponibles
</div>

<div class="leagues-toolbar">
  <input type="text" class="form-input" bind:value={searchQuery}
    placeholder="Rechercher une ligue ou un pays..." />
  <div class="leagues-toolbar__actions">
    <button class="btn btn--sm btn--primary" on:click={() => setAll(true)}>Tout sélectionner</button>
    <button class="btn btn--sm btn--secondary" on:click={() => setAll(false)}>Tout désélectionner</button>
  </div>
</div>

{#if loading}
  <div class="empty-state" style="padding:40px;">
    <div class="empty-state__icon">⏳</div>
    <div class="empty-state__title">Chargement des ligues...</div>
  </div>
{:else if filtered.length === 0}
  <div class="empty-state" style="padding:40px;">
    <div class="empty-state__icon">🔍</div>
    <div class="empty-state__title">Aucune ligue trouvee</div>
  </div>
{:else}
  <div class="leagues-list">
    {#each filtered as league (league.id)}
      {@const active = activeSeasonIds.has(league.id)}
      {@const stats = leagueStats[league.id]}
      <div class="league-item" class:league-item--active={active} class:league-item--expanded={expandedLeague === league.id}>
        <div class="league-item__header">
          <label class="toggle-switch" on:click|stopPropagation>
            <input type="checkbox" checked={active} on:change={() => toggleLeague(league)} />
            <span class="toggle-slider"></span>
          </label>
          <!-- svelte-ignore a11y-click-events-have-key-events -->
          <div class="league-item__info" on:click={() => toggleExpand(league.id)} role="button" tabindex="0">
            <div class="league-item__name">
              {league.name}
              {#if active}
                <span class="league-item__active-badge">active</span>
              {/if}
            </div>
            <div class="league-item__meta">
              {league.country}
              {#if league.year} · {league.year}{/if}
              {#if stats} · {stats.matchesPlayed}/{stats.totalMatches} matchs{/if}
            </div>
          </div>

          {#if stats}
            <div class="league-item__stats">
              <div class="league-stat-pill" title="But en 1MT (Over 0.5 FHG)">
                <span class="league-stat-pill__label">1MT</span>
                <span class="league-stat-pill__value" style:color={statColor(stats.over05FHG, 75, 60)}>{stats.over05FHG}%</span>
              </div>
              <div class="league-stat-pill" title="Moyenne buts/match">
                <span class="league-stat-pill__label">Avg</span>
                <span class="league-stat-pill__value" style:color={statColor(stats.avgGoals * 25, 75, 60)}>{stats.avgGoals}</span>
              </div>
              <div class="league-stat-pill" title="BTTS (les 2 equipes marquent)">
                <span class="league-stat-pill__label">BTTS</span>
                <span class="league-stat-pill__value" style:color={statColor(stats.btts, 55, 45)}>{stats.btts}%</span>
              </div>
              <div class="league-stat-pill" title="Over 2.5 buts">
                <span class="league-stat-pill__label">O2.5</span>
                <span class="league-stat-pill__value" style:color={statColor(stats.over25, 60, 45)}>{stats.over25}%</span>
              </div>
            </div>
          {:else if statsLoading[league.id]}
            <div class="league-item__stats-loading">...</div>
          {/if}

          <!-- svelte-ignore a11y-click-events-have-key-events -->
          <span class="league-item__arrow" on:click={() => toggleExpand(league.id)} role="button" tabindex="0">
            {expandedLeague === league.id ? '▼' : '▶'}
          </span>
        </div>

        {#if expandedLeague === league.id}
          <div class="league-item__table">
            {#if tableLoading}
              <div class="league-item__loading">⏳ Chargement du classement...</div>
            {:else if leagueTable && leagueTable.length > 0}
              <div class="table-wrapper">
                <table class="data-table data-table--compact">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Equipe</th>
                      <th>J</th>
                      <th>G</th>
                      <th>N</th>
                      <th>P</th>
                      <th>BP</th>
                      <th>BC</th>
                      <th>Diff</th>
                      <th>Pts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each leagueTable as team, i}
                      {@const gf = team.seasonGoals ?? team.seasonGoals_overall ?? 0}
                      {@const ga = team.seasonConceded ?? 0}
                      <tr>
                        <td>{team.position ?? i + 1}</td>
                        <td class="league-table__team">{team.cleanName || team.name || '—'}</td>
                        <td>{team.matchesPlayed ?? '—'}</td>
                        <td>{team.seasonWins_overall ?? '—'}</td>
                        <td>{team.seasonDraws_overall ?? '—'}</td>
                        <td>{team.seasonLosses_overall ?? '—'}</td>
                        <td>{gf}</td>
                        <td>{ga}</td>
                        <td class:league-table__diff--pos={gf - ga > 0} class:league-table__diff--neg={gf - ga < 0}>
                          {gf - ga > 0 ? '+' : ''}{gf - ga}
                        </td>
                        <td class="league-table__pts"><strong>{team.points ?? '—'}</strong></td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            {:else}
              <div class="league-item__loading">Aucune donnee de classement disponible</div>
            {/if}
          </div>
        {/if}
      </div>
    {/each}
  </div>
{/if}

<style>
  .leagues-toolbar {
    display: flex;
    gap: 12px;
    align-items: center;
    margin-bottom: 16px;
    flex-wrap: wrap;
  }
  .leagues-toolbar .form-input {
    flex: 1;
    min-width: 200px;
    max-width: 400px;
  }
  .leagues-toolbar__actions {
    display: flex;
    gap: 8px;
  }
  .leagues-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .league-item {
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    overflow: hidden;
    transition: border-color 0.2s;
  }
  .league-item--active {
    border-left: 3px solid var(--color-accent-green);
  }
  .league-item--expanded {
    border-color: var(--color-accent-blue);
  }
  .league-item__header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
  }
  .league-item__info {
    flex: 1;
    cursor: pointer;
    min-width: 0;
  }
  .league-item__info:hover {
    opacity: 0.85;
  }
  .league-item__name {
    font-size: 14px;
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .league-item__active-badge {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    color: var(--color-accent-green);
    background: rgba(29, 158, 117, 0.12);
    padding: 1px 6px;
    border-radius: 4px;
  }
  .league-item__meta {
    font-size: 11px;
    color: var(--color-text-muted);
    margin-top: 2px;
  }
  .league-item__stats {
    display: flex;
    gap: 6px;
    flex-shrink: 0;
  }
  .league-item__stats-loading {
    font-size: 11px;
    color: var(--color-text-muted);
    flex-shrink: 0;
  }
  .league-stat-pill {
    display: flex;
    flex-direction: column;
    align-items: center;
    background: rgba(255,255,255,0.04);
    border-radius: 6px;
    padding: 3px 8px;
    min-width: 42px;
  }
  .league-stat-pill__label {
    font-size: 9px;
    font-weight: 600;
    text-transform: uppercase;
    color: var(--color-text-muted);
    letter-spacing: 0.3px;
  }
  .league-stat-pill__value {
    font-size: 13px;
    font-weight: 700;
  }
  .league-item__arrow {
    font-size: 11px;
    color: var(--color-text-muted);
    cursor: pointer;
    padding: 4px;
  }
  .league-item__table {
    border-top: 1px solid var(--color-border);
    max-height: 500px;
    overflow-y: auto;
  }
  .league-item__loading {
    padding: 16px;
    text-align: center;
    color: var(--color-text-muted);
    font-size: 13px;
  }
  .data-table--compact {
    font-size: 12px;
  }
  .data-table--compact th,
  .data-table--compact td {
    padding: 5px 8px;
  }
  .league-table__team {
    white-space: nowrap;
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: 500;
  }
  .league-table__pts {
    color: var(--color-accent-green);
  }
  .league-table__diff--pos {
    color: var(--color-accent-green);
  }
  .league-table__diff--neg {
    color: var(--color-danger);
  }

  @media (max-width: 640px) {
    .league-item__stats {
      display: none;
    }
  }
</style>
