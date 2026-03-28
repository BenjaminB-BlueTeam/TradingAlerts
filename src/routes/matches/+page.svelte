<script>
  import { onMount } from 'svelte';
  import { leagues } from '$lib/stores/appStore.js';
  import { getTodaysMatches, getAllLeagues } from '$lib/api/footystats.js';

  let filtrePlage = 0;
  let filtreLigue = 'toutes';
  let allMatches = [];
  let loading = false;
  let leagueNames = {}; // competition_id → nom de la ligue

  $: activeLeagues = $leagues.filter(l => l.active);

  function getLeagueName(m) {
    const compId = m.competition_id || m.league_id;
    return leagueNames[compId] || m.competition_name || m.league_name || '—';
  }

  // Filtrage réactif : exclure les terminés + filtre ligue
  $: filteredMatches = allMatches.filter(m => {
    const status = (m.status || '').toLowerCase();
    if (status === 'complete' || status === 'finished') return false;
    if (filtreLigue === 'toutes') return true;
    const compId = m.competition_id || m.league_id;
    const league = activeLeagues.find(l => l.id === filtreLigue);
    if (!league) return true;
    // Matcher par season_ids ou par nom
    const lName = getLeagueName(m);
    return lName.includes(league.name) || league.name.includes(lName);
  }).sort((a, b) => (a.date_unix || 0) - (b.date_unix || 0));

  function getDateStr(offset) {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return d.toISOString().split('T')[0];
  }

  function formatTime(unix) {
    if (!unix) return '—';
    return new Date(unix * 1000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  function formatDate(unix) {
    if (!unix) return '';
    return new Date(unix * 1000).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
  }

  async function loadMatches(plage) {
    loading = true;
    const offsets = plage === -1 ? [0, 1, 2] : [plage];
    const results = [];
    for (const offset of offsets) {
      try {
        const dateStr = getDateStr(offset);
        const matches = await getTodaysMatches(dateStr);
        if (Array.isArray(matches)) results.push(...matches);
      } catch {}
    }
    allMatches = results;
    loading = false;
  }

  // Recharger quand la plage change
  $: loadMatches(filtrePlage);

  async function loadLeagueNames() {
    try {
      const leagues = await getAllLeagues();
      for (const l of leagues) {
        // Mapper chaque season_id vers le nom de la ligue
        if (l.id) leagueNames[l.id] = l.name;
        if (l.seasons) {
          for (const s of l.seasons) {
            leagueNames[s.id] = l.name;
          }
        }
      }
      leagueNames = leagueNames; // trigger reactivity
    } catch {}
  }

  onMount(() => {
    loadLeagueNames();
    loadMatches(filtrePlage);
  });
</script>

<div class="page-title">⚽ Matchs à venir</div>
<div class="page-subtitle">
  {filteredMatches.length} match{filteredMatches.length > 1 ? 's' : ''} trouves
</div>

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
      <option value={l.id}>{l.name}</option>
    {/each}
  </select>

  {#if loading}
    <span style="font-size:12px;color:var(--color-text-muted);">⏳ Chargement...</span>
  {/if}
</div>

<!-- TABLE -->
{#if loading}
  <div class="empty-state">
    <div class="empty-state__icon">⏳</div>
    <div class="empty-state__title">Chargement des matchs...</div>
  </div>
{:else if filteredMatches.length > 0}
  <div class="table-wrapper">
    <table class="data-table">
      <thead>
        <tr>
          <th>Date</th>
          <th>Heure</th>
          <th>Match</th>
          <th>Ligue</th>
          <th>Score</th>
        </tr>
      </thead>
      <tbody>
        {#each filteredMatches as m (m.id)}
          <tr>
            <td>{formatDate(m.date_unix)}</td>
            <td>{formatTime(m.date_unix)}</td>
            <td style="font-weight:600;">{m.home_name || '?'} vs {m.away_name || '?'}</td>
            <td style="font-size:12px;color:var(--color-text-muted);">{getLeagueName(m)}</td>
            <td style="font-weight:700;">
              {#if m.homeGoalCount != null && m.awayGoalCount != null}
                {m.homeGoalCount} - {m.awayGoalCount}
              {:else}
                —
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{:else}
  <div class="empty-state">
    <div class="empty-state__icon">⚽</div>
    <div class="empty-state__title">Aucun match trouve</div>
    <div class="empty-state__desc">Changez la date ou la ligue et cliquez sur Rechercher</div>
  </div>
{/if}
