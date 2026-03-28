<script>
  import { leagues, signaux, exclus, saveLeagues } from '$lib/stores/appStore.js';
  import { calcLeagueStats } from '$lib/core/filters.js';

  $: allMatches = [...$signaux, ...$exclus];

  function toggleLeague(leagueId) {
    const updated = $leagues.map(l =>
      l.id === leagueId ? { ...l, active: !l.active } : l
    );
    saveLeagues(updated);
  }

  function getStats(leagueId) {
    return calcLeagueStats(allMatches, leagueId);
  }
</script>

<div class="page-title">🏆 Ligues actives</div>
<div class="page-subtitle">Gérez les ligues à surveiller — {$leagues.filter(l => l.active).length} actives sur {$leagues.length}</div>

<div class="leagues-grid">
  {#each $leagues as league (league.id)}
    {@const stats = getStats(league.id)}
    <div class="league-card">
      <div class="league-card__header">
        <span class="league-card__flag">{league.flag}</span>
        <div style="flex:1;">
          <div class="league-card__name">{league.name}</div>
          <div style="font-size:11px;color:var(--color-text-muted);">{league.country}</div>
        </div>
        <label class="toggle-switch league-card__toggle">
          <input type="checkbox" checked={league.active} on:change={() => toggleLeague(league.id)} />
          <span class="toggle-slider"></span>
        </label>
      </div>

      <div class="league-card__stats">
        <div class="league-stat">
          <span class="league-stat__label">FHG moy.</span>
          <span class="league-stat__value" class:green={stats.avgFHG >= 75} class:orange={stats.avgFHG >= 60 && stats.avgFHG < 75}>
            {stats.avgFHG}%
          </span>
        </div>
        <div class="league-stat">
          <span class="league-stat__label">1MT moy.</span>
          <span class="league-stat__value" class:green={stats.avg1MT >= 50}>
            {stats.avg1MT}%
          </span>
        </div>
        <div class="league-stat">
          <span class="league-stat__label">Signaux forts</span>
          <span class="league-stat__value green">{stats.forts}</span>
        </div>
        <div class="league-stat">
          <span class="league-stat__label">Exclus H2H</span>
          <span class="league-stat__value" class:orange={stats.exclus > 0}>{stats.exclus}</span>
        </div>
      </div>
    </div>
  {/each}
</div>
