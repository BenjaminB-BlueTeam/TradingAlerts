<script>
  import { onMount } from 'svelte';
  import { getAllLeagues, getLeagueTable } from '$lib/api/footystats.js';

  let allLeagues = [];
  let loading = true;
  let searchQuery = '';
  let expandedLeague = null;
  let leagueTable = null;
  let tableLoading = false;

  // Groupement par pays
  $: grouped = groupByCountry(filtered);
  $: filtered = searchQuery
    ? allLeagues.filter(l =>
        (l.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (l.country || '').toLowerCase().includes(searchQuery.toLowerCase())
      )
    : allLeagues;

  function groupByCountry(leagues) {
    const map = {};
    for (const l of leagues) {
      const country = l.country || 'Autre';
      if (!map[country]) map[country] = [];
      map[country].push(l);
    }
    // Trier par nombre de ligues décroissant
    return Object.entries(map)
      .sort(([, a], [, b]) => b.length - a.length);
  }

  async function toggleLeague(leagueId) {
    if (expandedLeague === leagueId) {
      expandedLeague = null;
      leagueTable = null;
      return;
    }
    expandedLeague = leagueId;
    leagueTable = null;
    tableLoading = true;
    try {
      leagueTable = await getLeagueTable(leagueId);
    } catch (e) {
      leagueTable = [];
      if (window.showToast) window.showToast(`Erreur : ${e.message}`, 'error');
    }
    tableLoading = false;
  }

  onMount(async () => {
    try {
      const data = await getAllLeagues();
      allLeagues = Array.isArray(data) ? data : [];
    } catch (e) {
      allLeagues = [];
      if (window.showToast) window.showToast(`Erreur chargement ligues : ${e.message}`, 'error');
    }
    loading = false;
  });
</script>

<div class="page-title">🌍 Explorer les ligues</div>
<div class="page-subtitle">
  {allLeagues.length} ligues disponibles
  {#if searchQuery} — {filtered.length} resultats{/if}
</div>

<div class="explore-search">
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
  {#each grouped as [country, leagues]}
    <div class="explore-country">
      <div class="explore-country__header">
        {country} <span class="explore-country__count">({leagues.length})</span>
      </div>
      <div class="explore-leagues-grid">
        {#each leagues as league (league.id || league.league_id)}
          {@const lid = league.id || league.league_id}
          <div class="explore-league-card" class:expanded={expandedLeague === lid}>
            <!-- svelte-ignore a11y-click-events-have-key-events -->
            <div class="explore-league-card__header" on:click={() => toggleLeague(lid)} role="button" tabindex="0">
              <div class="explore-league-card__info">
                <div class="explore-league-card__name">{league.name || league.league_name}</div>
                <div class="explore-league-card__meta">
                  {#if league.season}Saison {league.season}{/if}
                </div>
              </div>
              <span class="explore-league-card__arrow">{expandedLeague === lid ? '▼' : '▶'}</span>
            </div>

            {#if expandedLeague === lid}
              <div class="explore-league-card__body">
                {#if tableLoading}
                  <div style="padding:16px;text-align:center;color:var(--color-text-muted);font-size:13px;">
                    ⏳ Chargement du classement...
                  </div>
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
                          <tr>
                            <td>{team.position || team.tablePosition || i + 1}</td>
                            <td class="explore-team-name">{team.name || team.cleanName || team.team_name || '—'}</td>
                            <td>{team.matchesPlayed ?? team.matches_played ?? team.seasonMatchesPlayed_overall ?? '—'}</td>
                            <td>{team.seasonWins_overall ?? team.wins ?? team.W ?? '—'}</td>
                            <td>{team.seasonDraws_overall ?? team.draws ?? team.D ?? '—'}</td>
                            <td>{team.seasonLosses_overall ?? team.losses ?? team.L ?? '—'}</td>
                            <td>{team.seasonGoals_overall ?? team.goals_scored ?? team.F ?? '—'}</td>
                            <td>{team.seasonConceded_overall ?? team.goals_conceded ?? team.A ?? '—'}</td>
                            <td>{team.seasonGoalDifference_overall ?? (team.seasonGoals_overall != null && team.seasonConceded_overall != null ? team.seasonGoals_overall - team.seasonConceded_overall : '—')}</td>
                            <td class="explore-pts"><strong>{team.points ?? team.seasonPts_overall ?? team.pts ?? '—'}</strong></td>
                          </tr>
                        {/each}
                      </tbody>
                    </table>
                  </div>
                {:else}
                  <div style="padding:16px;text-align:center;color:var(--color-text-muted);font-size:13px;">
                    Aucune donnee de classement disponible
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {/each}
{/if}

<style>
  .explore-search {
    margin-bottom: 20px;
    max-width: 400px;
  }
  .explore-country {
    margin-bottom: 24px;
  }
  .explore-country__header {
    font-size: 15px;
    font-weight: 600;
    padding: 8px 0;
    border-bottom: 1px solid var(--color-border);
    margin-bottom: 10px;
    color: var(--color-text-primary);
  }
  .explore-country__count {
    font-weight: 400;
    color: var(--color-text-muted);
    font-size: 13px;
  }
  .explore-leagues-grid {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .explore-league-card {
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    overflow: hidden;
    transition: border-color 0.2s;
  }
  .explore-league-card.expanded {
    border-color: var(--color-accent-blue);
  }
  .explore-league-card__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    cursor: pointer;
    transition: background 0.15s;
  }
  .explore-league-card__header:hover {
    background: rgba(255,255,255,0.03);
  }
  .explore-league-card__name {
    font-size: 14px;
    font-weight: 500;
  }
  .explore-league-card__meta {
    font-size: 11px;
    color: var(--color-text-muted);
  }
  .explore-league-card__arrow {
    font-size: 11px;
    color: var(--color-text-muted);
  }
  .explore-league-card__body {
    border-top: 1px solid var(--color-border);
    max-height: 500px;
    overflow-y: auto;
  }
  .data-table--compact {
    font-size: 12px;
  }
  .data-table--compact th,
  .data-table--compact td {
    padding: 5px 8px;
  }
  .explore-team-name {
    white-space: nowrap;
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: 500;
  }
  .explore-pts {
    color: var(--color-accent-green);
  }
</style>
