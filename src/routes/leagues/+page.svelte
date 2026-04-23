<script>
  import { onMount } from 'svelte';
  import { leagues, saveLeagues, apiConnected } from '$lib/stores/appStore.js';
  import { statColor, fetchLeagues, loadAllStats } from '$lib/utils/leagueHelpers.js';
  import { supabase } from '$lib/api/supabase.js';
  import { fhgColor } from '$lib/utils/formatters.js';

  let apiLeagues = $state([]);
  let loading = $state(true);
  let searchQuery = $state('');
  let expandedLeague = $state(null);
  let fhgTeams = $state(null);   // Array<{team_name, fhg_pct, matches_count}> | null
  let fhgLoading = $state(false);
  let loaded = $state(false);

  // Stats par ligue (season_id → stats)
  let leagueStats = $state({});
  let statsLoading = $state({});

  async function loadLeagues() {
    if (loaded && apiLeagues.length > 10) return;
    loading = true;
    const result = await fetchLeagues();
    apiLeagues = result.leagues;
    if (result.loaded) {
      loaded = true;
      loadAllStats(apiLeagues, leagueStats, (id, stats) => {
        if (stats === undefined) {
          statsLoading[id] = true;
          statsLoading = statsLoading;
        } else {
          leagueStats[id] = stats;
          leagueStats = leagueStats;
          statsLoading[id] = false;
          statsLoading = statsLoading;
        }
      });
    }
    loading = false;
  }

  $effect(() => { if ($apiConnected && !loaded) loadLeagues(); });

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
  let activeSeasonIds = $derived(new Set(
    apiLeagues
      .filter(l => {
        const idx = findStoreIndex($leagues, l);
        return idx > -1 && $leagues[idx].active;
      })
      .map(l => l.id)
  ));

  let activeCount = $derived(activeSeasonIds.size);

  let filtered = $derived(searchQuery
    ? apiLeagues.filter(l =>
        l.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        l.country.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : apiLeagues);

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
      fhgTeams = null;
      return;
    }
    expandedLeague = seasonId;
    fhgTeams = null;
    fhgLoading = true;
    const { data } = await supabase
      .from('team_fhg_cache')
      .select('team_name, fhg_pct, matches_count')
      .eq('season_id', seasonId)
      .order('fhg_pct', { ascending: false });
    fhgTeams = data || [];
    fhgLoading = false;
  }

  onMount(() => {
    loadLeagues();
  });
</script>

<h1 class="page-title">🏆 Ligues actives</h1>
<p class="page-subtitle">
  {activeCount} ligue{activeCount > 1 ? 's' : ''} active{activeCount > 1 ? 's' : ''} sur {apiLeagues.length} disponibles
</p>

<div class="leagues-toolbar">
  <input type="text" class="form-input" bind:value={searchQuery}
    placeholder="Rechercher une ligue ou un pays..." />
  <div class="leagues-toolbar__actions">
    <button class="btn btn--sm btn--primary" onclick={() => setAll(true)}>Tout sélectionner</button>
    <button class="btn btn--sm btn--secondary" onclick={() => setAll(false)}>Tout désélectionner</button>
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
          <label class="toggle-switch" onclick={(e) => e.stopPropagation()}>
            <input type="checkbox" checked={active} onchange={() => toggleLeague(league)} />
            <span class="toggle-slider"></span>
          </label>
          <div class="league-item__info" onclick={() => toggleExpand(league.id)} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpand(league.id); } }} role="button" tabindex="0" aria-expanded={expandedLeague === league.id}>
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

          <span class="league-item__arrow" onclick={() => toggleExpand(league.id)} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpand(league.id); } }} role="button" tabindex="0" aria-expanded={expandedLeague === league.id}>
            {expandedLeague === league.id ? '▼' : '▶'}
          </span>
        </div>

        {#if expandedLeague === league.id}
          <div class="league-item__table">
            {#if fhgLoading}
              <div class="league-item__loading">Chargement...</div>
            {:else if fhgTeams && fhgTeams.length > 0}
              <table class="data-table data-table--compact fhg-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Equipe</th>
                    <th title="But marque en 0-45 min (stoppage compris)">FHG 0-45</th>
                    <th>J</th>
                  </tr>
                </thead>
                <tbody>
                  {#each fhgTeams as t, i}
                    <tr>
                      <td class="fhg-table__rank">{i + 1}</td>
                      <td class="league-table__team">{t.team_name || '—'}</td>
                      <td class="fhg-table__pct">
                        <strong style:color={fhgColor(t.fhg_pct)}>{t.fhg_pct ?? '—'}%</strong>
                      </td>
                      <td class="fhg-table__matches">{t.matches_count ?? '—'}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            {:else}
              <div class="league-item__loading">Données non disponibles — actualisation automatique demain (7h UTC)</div>
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
    width: 100%;
    border-collapse: collapse;
  }
  .data-table--compact th,
  .data-table--compact td {
    padding: 5px 10px;
    border-bottom: 1px solid rgba(255,255,255,0.04);
    text-align: left;
  }
  .data-table--compact th {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    color: var(--color-text-muted);
  }
  .league-table__team {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: 500;
    max-width: 200px;
  }
  .fhg-table__rank {
    color: var(--color-text-muted);
    width: 28px;
    font-size: 11px;
  }
  .fhg-table__pct {
    width: 70px;
    font-size: 13px;
  }
  .fhg-table__matches {
    color: var(--color-text-muted);
    font-size: 11px;
    width: 36px;
  }

  @media (max-width: 640px) {
    .league-item__stats {
      display: none;
    }
  }
</style>
