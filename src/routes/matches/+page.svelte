<script>
  import { onMount } from 'svelte';
  import { leagues, isDemo } from '$lib/stores/appStore.js';
  import { getTodaysMatches } from '$lib/api/footystats.js';

  let filtrePlage = 0; // offset jours: 0=aujourd'hui, 1=demain, 2=après-demain
  let filtreLigue = 'toutes';
  let allMatches = [];
  let filteredMatches = [];
  let loading = false;

  $: activeLeagues = $leagues.filter(l => l.active);

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

  async function rechercher() {
    loading = true;
    filteredMatches = [];

    // Déterminer quels jours charger
    const offsets = filtrePlage === -1 ? [0, 1, 2] : [filtrePlage];

    const results = [];
    for (const offset of offsets) {
      try {
        const dateStr = getDateStr(offset);
        const matches = await getTodaysMatches(dateStr);
        if (Array.isArray(matches)) {
          matches.forEach(m => { m._offset = offset; });
          results.push(...matches);
        }
      } catch {}
    }

    allMatches = results;

    // Filtrer par ligue
    filteredMatches = allMatches.filter(m => {
      if (filtreLigue === 'toutes') return true;
      const compName = m.competition_name || m.league_name || '';
      const league = activeLeagues.find(l => l.id === filtreLigue);
      if (!league) return true;
      return compName.includes(league.name) || league.name.includes(compName);
    }).sort((a, b) => (a.date_unix || 0) - (b.date_unix || 0));

    loading = false;
  }

  onMount(() => { rechercher(); });
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

  <button class="btn btn--primary btn--sm" on:click={rechercher} disabled={loading}>
    {loading ? '⏳' : 'Rechercher'}
  </button>
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
          <th>Statut</th>
          <th>Score</th>
        </tr>
      </thead>
      <tbody>
        {#each filteredMatches as m (m.id)}
          <tr>
            <td>{formatDate(m.date_unix)}</td>
            <td>{formatTime(m.date_unix)}</td>
            <td style="font-weight:600;">{m.home_name || '?'} vs {m.away_name || '?'}</td>
            <td style="font-size:12px;color:var(--color-text-muted);">{m.competition_name || m.league_name || '—'}</td>
            <td>
              {#if m.status === 'complete' || m.status === 'finished'}
                <span style="color:var(--color-text-muted);">Termine</span>
              {:else if m.status === 'inplay' || m.status === 'live'}
                <span style="color:var(--color-danger);font-weight:600;">En cours</span>
              {:else}
                <span style="color:var(--color-accent-green);">A venir</span>
              {/if}
            </td>
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
