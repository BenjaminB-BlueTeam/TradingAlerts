<script>
  import { signaux, exclus, leagues, config } from '$lib/stores/appStore.js';
  import { filtrerMatchsUpcoming } from '$lib/core/filters.js';

  let filtrePlage    = 'aujourd_hui';
  let filtreLigue    = 'toutes';
  let filtreSignal   = 0;
  let filtreContexte = 'tous';
  let filtre1MT      = false;
  $: allMatches = [...$signaux];
  $: filteredMatches = filtrerMatchsUpcoming(allMatches, {
    plage:         filtrePlage,
    ligue:         filtreLigue,
    signalMin:     filtreSignal,
    contexte:      filtreContexte,
    seuil1MTOnly:  filtre1MT,
  });

  $: activeLeagues = $leagues.filter(l => l.active);

  function getSignalLabel(signal) {
    if (signal === 'fort')  return '🔥 FORT';
    if (signal === 'moyen') return '⚡ MOY';
    return '— FAI';
  }
  function getScoreClass(score) {
    if (score >= 75) return 'td-green';
    if (score >= 60) return 'td-orange';
    return 'td-grey';
  }
  function getH2HLabel(warningH2H, butsH2H1MT, nbH2H) {
    if (warningH2H === 'vert')   return `✓ ${butsH2H1MT}/${nbH2H}`;
    if (warningH2H === 'orange') return `⚠ ${butsH2H1MT}/${nbH2H}`;
    if (warningH2H === 'rouge')  return `✗ 0/${nbH2H}`;
    return `? ${nbH2H || 0}`;
  }
</script>

<div class="page-title">⚽ Matchs à venir</div>
<div class="page-subtitle">Tous les matchs analysés du jour triés par score FHG</div>

<!-- FILTERS BAR -->
<div class="filters-bar">
  <select class="filter-select" bind:value={filtrePlage}>
    <option value="aujourd_hui">Aujourd'hui</option>
    <option value="demain">Demain</option>
    <option value="apres_demain">Apres-demain</option>
    <option value="tous">Tous</option>
  </select>

  <select class="filter-select filter-select--league" bind:value={filtreLigue}>
    <option value="toutes">Toutes les ligues</option>
    {#each activeLeagues as l}
      <option value={l.id}>{l.name}</option>
    {/each}
  </select>

  <select class="filter-select" bind:value={filtreSignal}>
    <option value={0}>Signal: tous</option>
    <option value={60}>Signal ≥ 60</option>
    <option value={75}>Signal ≥ 75</option>
  </select>

  <select class="filter-select" bind:value={filtreContexte}>
    <option value="tous">Contexte: tous</option>
    <option value="domicile">Domicile</option>
    <option value="exterieur">Exterieur</option>
  </select>

  <label class="filter-toggle">
    <input type="checkbox" bind:checked={filtre1MT} />
    <span>1MT 50%+</span>
  </label>
</div>

<!-- TABLE -->
{#if filteredMatches.length > 0}
  <div class="table-wrapper">
    <table class="data-table">
      <thead>
        <tr>
          <th>Heure</th>
          <th>Match</th>
          <th>Ligue</th>
          <th>Équipe Signal</th>
          <th>FHG%</th>
          <th>Forme 5M</th>
          <th>1MT%</th>
          <th>H2H</th>
          <th>Score</th>
          <th>Signal</th>
          <th>DC</th>
        </tr>
      </thead>
      <tbody>
        {#each filteredMatches as m (m.id)}
          {@const sc = m.scoreChoisi || {}}
          <tr class:row--warning={sc.warningH2H === 'orange'}>
            <td>{m.time || '—'}</td>
            <td>
              <div style="font-weight:600;">{m.homeName} vs {m.awayName}</div>
              {#if m.exclu}
                <div style="font-size:11px;color:var(--color-danger);">{m.raisonExclusion}</div>
              {/if}
            </td>
            <td>{m.leagueFlag || ''} {m.leagueName || ''}</td>
            <td style="color:var(--color-text-primary);">{m.equipeSignal || '—'}</td>
            <td class={getScoreClass(sc.tauxN || 0)}>{sc.tauxN || 0}%</td>
            <td class={getScoreClass((sc.forme5M || 0) / 100 * 60)}>
              {Math.round((sc.forme5M || 0) / 20)}/5
            </td>
            <td class={(sc.pct1MT || 0) >= 50 ? 'td-green' : 'td-grey'}>{sc.pct1MT || 0}%</td>
            <td class={
              sc.warningH2H === 'vert' ? 'td-green' :
              sc.warningH2H === 'orange' ? 'td-orange' : 'td-grey'
            }>{getH2HLabel(sc.warningH2H, sc.butsH2H1MT, sc.nbH2H)}</td>
            <td class={getScoreClass(sc.score || 0)}><strong>{sc.score || 0}</strong></td>
            <td>
              {#if !m.exclu}
                <span class="badge badge--{sc.signal || 'faible'}">
                  {getSignalLabel(sc.signal)}
                </span>
              {:else}
                <span class="badge badge--exclu">✗ EXCLU</span>
              {/if}
            </td>
            <td>{m.scoreDC ? `${m.scoreDC}pts` : '—'}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{:else}
  <div class="empty-state">
    <div class="empty-state__icon">⚽</div>
    <div class="empty-state__title">Aucun match correspondant</div>
    <div class="empty-state__desc">Modifiez les filtres pour voir plus de matchs</div>
  </div>
{/if}
