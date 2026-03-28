<script>
  import { onMount } from 'svelte';
  import { isDemo } from '$lib/stores/appStore.js';
  import { getAllLeagues, getLeagueTable, getLeagueSeason, rawApiCall, normalizeLeagues } from '$lib/api/footystats.js';

  let allLeagues = [];
  let loading = true;
  let searchQuery = '';
  let expandedLeague = null;
  let leagueTable = null;
  let tableLoading = false;
  let loaded = false;

  // Stats par ligue
  let leagueStats = {};
  let statsLoading = {};

  async function loadLeagues() {
    if (loaded && allLeagues.length > 10) return;
    loading = true;
    try {
      const res = await rawApiCall('league-list', { chosen_leagues_only: 'true' });
      if (res.status === 200) {
        allLeagues = normalizeLeagues(res.data);
        loaded = true;
        loadAllStats();
      } else {
        allLeagues = await getAllLeagues();
      }
    } catch {
      allLeagues = await getAllLeagues();
    }
    loading = false;
  }

  async function loadAllStats() {
    for (let i = 0; i < allLeagues.length; i += 3) {
      const batch = allLeagues.slice(i, i + 3);
      await Promise.all(batch.map(l => loadLeagueStats(l.id)));
      if (i + 3 < allLeagues.length) {
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
    } catch {}
    statsLoading[seasonId] = false;
    statsLoading = statsLoading;
  }

  $: if (!$isDemo && !loaded) loadLeagues();

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

  function statColor(val, green, orange) {
    if (val >= green) return 'var(--color-accent-green)';
    if (val >= orange) return 'var(--color-signal-moyen)';
    return 'var(--color-text-muted)';
  }

  onMount(() => {
    loadLeagues();
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
        {#each leagues as league (league.id)}
          {@const stats = leagueStats[league.id]}
          <div class="explore-league-card" class:expanded={expandedLeague === league.id}>
            <!-- svelte-ignore a11y-click-events-have-key-events -->
            <div class="explore-league-card__header" on:click={() => toggleLeague(league.id)} role="button" tabindex="0">
              <div class="explore-league-card__info">
                <div class="explore-league-card__name">{league.name}</div>
                <div class="explore-league-card__meta">
                  {#if league.year}Saison {league.year}{/if}
                  {#if stats} · {stats.matchesPlayed}/{stats.totalMatches} matchs{/if}
                </div>
              </div>

              {#if stats}
                <div class="explore-stats">
                  <div class="explore-stat" title="But en 1MT (Over 0.5 FHG)">
                    <span class="explore-stat__label">1MT</span>
                    <span class="explore-stat__value" style:color={statColor(stats.over05FHG, 75, 60)}>{stats.over05FHG}%</span>
                  </div>
                  <div class="explore-stat" title="Moyenne buts/match">
                    <span class="explore-stat__label">Avg</span>
                    <span class="explore-stat__value" style:color={statColor(stats.avgGoals * 25, 75, 60)}>{stats.avgGoals}</span>
                  </div>
                  <div class="explore-stat" title="BTTS">
                    <span class="explore-stat__label">BTTS</span>
                    <span class="explore-stat__value" style:color={statColor(stats.btts, 55, 45)}>{stats.btts}%</span>
                  </div>
                  <div class="explore-stat" title="Over 2.5 buts">
                    <span class="explore-stat__label">O2.5</span>
                    <span class="explore-stat__value" style:color={statColor(stats.over25, 60, 45)}>{stats.over25}%</span>
                  </div>
                </div>
              {:else if statsLoading[league.id]}
                <span class="explore-stats-loading">...</span>
              {/if}

              <span class="explore-league-card__arrow">{expandedLeague === league.id ? '▼' : '▶'}</span>
            </div>

            {#if expandedLeague === league.id}
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
                          {@const gf = team.seasonGoals ?? 0}
                          {@const ga = team.seasonConceded ?? 0}
                          <tr>
                            <td>{team.position ?? i + 1}</td>
                            <td class="explore-team-name">{team.cleanName || team.name || '—'}</td>
                            <td>{team.matchesPlayed ?? '—'}</td>
                            <td>{team.seasonWins_overall ?? '—'}</td>
                            <td>{team.seasonDraws_overall ?? '—'}</td>
                            <td>{team.seasonLosses_overall ?? '—'}</td>
                            <td>{gf}</td>
                            <td>{ga}</td>
                            <td>{team.seasonGoalDifference ?? gf - ga}</td>
                            <td class="explore-pts"><strong>{team.points ?? '—'}</strong></td>
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
    gap: 10px;
    padding: 10px 14px;
    cursor: pointer;
    transition: background 0.15s;
  }
  .explore-league-card__header:hover {
    background: rgba(255,255,255,0.03);
  }
  .explore-league-card__info {
    flex: 1;
    min-width: 0;
  }
  .explore-league-card__name {
    font-size: 14px;
    font-weight: 500;
  }
  .explore-league-card__meta {
    font-size: 11px;
    color: var(--color-text-muted);
  }
  .explore-stats {
    display: flex;
    gap: 6px;
    flex-shrink: 0;
  }
  .explore-stats-loading {
    font-size: 11px;
    color: var(--color-text-muted);
    flex-shrink: 0;
  }
  .explore-stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    background: rgba(255,255,255,0.04);
    border-radius: 6px;
    padding: 3px 8px;
    min-width: 42px;
  }
  .explore-stat__label {
    font-size: 9px;
    font-weight: 600;
    text-transform: uppercase;
    color: var(--color-text-muted);
    letter-spacing: 0.3px;
  }
  .explore-stat__value {
    font-size: 13px;
    font-weight: 700;
  }
  .explore-league-card__arrow {
    font-size: 11px;
    color: var(--color-text-muted);
    flex-shrink: 0;
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

  @media (max-width: 640px) {
    .explore-stats {
      display: none;
    }
  }
</style>
