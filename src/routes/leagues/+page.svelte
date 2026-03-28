<script>
  import { onMount } from 'svelte';
  import { leagues, saveLeagues, isDemo } from '$lib/stores/appStore.js';
  import { getAllLeagues, getLeagueTable, rawApiCall, normalizeLeagues } from '$lib/api/footystats.js';

  let apiLeagues = [];
  let loading = true;
  let searchQuery = '';
  let expandedLeague = null;
  let leagueTable = null;
  let tableLoading = false;
  let loaded = false;

  async function loadLeagues() {
    if (loaded && apiLeagues.length > 10) return; // déjà chargé avec les vraies données
    loading = true;
    try {
      // Appel direct sans passer par le check isDemo
      const res = await rawApiCall('league-list', { chosen_leagues_only: 'true' });
      if (res.status === 200) {
        apiLeagues = normalizeLeagues(res.data);
        loaded = true;
      } else {
        // Fallback sur getAllLeagues (qui retourne mock en demo)
        apiLeagues = await getAllLeagues();
      }
    } catch (e) {
      apiLeagues = await getAllLeagues();
    }
    loading = false;
  }

  // Recharger quand l'API se connecte (isDemo passe de true à false)
  $: if (!$isDemo && !loaded) loadLeagues();

  // Set des season_id actifs pour lookup rapide
  $: activeIds = new Set($leagues.filter(l => l.active).map(l => l.leagueId || l.id));
  $: activeCount = activeIds.size;

  $: filtered = searchQuery
    ? apiLeagues.filter(l =>
        l.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        l.country.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : apiLeagues;

  function isActive(seasonId) {
    return activeIds.has(seasonId);
  }

  function toggleLeague(league) {
    const sid = league.id; // season_id
    const current = [...$leagues];
    const idx = current.findIndex(l => (l.leagueId || l.id) === sid);

    if (idx > -1) {
      // Existe déjà → toggle
      current[idx] = { ...current[idx], active: !current[idx].active };
    } else {
      // Ajouter comme active
      current.push({
        id: league.name.toLowerCase().replace(/\s+/g, '-'),
        name: league.name,
        country: league.country,
        flag: '',
        active: true,
        leagueId: sid,
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

  onMount(() => {
    loadLeagues();
  });
</script>

<div class="page-title">🏆 Ligues actives</div>
<div class="page-subtitle">
  {activeCount} ligue{activeCount > 1 ? 's' : ''} active{activeCount > 1 ? 's' : ''} sur {apiLeagues.length} disponibles
</div>

<div class="leagues-search">
  <input type="text" class="form-input" bind:value={searchQuery}
    placeholder="Rechercher une ligue ou un pays..." />
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
      {@const active = isActive(league.id)}
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
            </div>
          </div>
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
                      {@const gf = team.seasonGoals_overall ?? team.goals_scored ?? 0}
                      {@const ga = team.seasonConceded_overall ?? team.goals_conceded ?? 0}
                      <tr>
                        <td>{team.position || team.tablePosition || i + 1}</td>
                        <td class="league-table__team">{team.name || team.cleanName || team.team_name || '—'}</td>
                        <td>{team.matchesPlayed ?? team.matches_played ?? team.seasonMatchesPlayed_overall ?? '—'}</td>
                        <td>{team.seasonWins_overall ?? team.wins ?? '—'}</td>
                        <td>{team.seasonDraws_overall ?? team.draws ?? '—'}</td>
                        <td>{team.seasonLosses_overall ?? team.losses ?? '—'}</td>
                        <td>{gf}</td>
                        <td>{ga}</td>
                        <td class:league-table__diff--pos={gf - ga > 0} class:league-table__diff--neg={gf - ga < 0}>
                          {gf - ga > 0 ? '+' : ''}{gf - ga}
                        </td>
                        <td class="league-table__pts"><strong>{team.points ?? team.seasonPts_overall ?? team.pts ?? '—'}</strong></td>
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
  .leagues-search {
    margin-bottom: 16px;
    max-width: 400px;
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
</style>
