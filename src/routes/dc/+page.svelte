<script>
  import { onMount } from 'svelte';
  import { isDemo } from '$lib/stores/appStore.js';
  import { getTodaysMatches, getLeagueMatches, rawApiCall } from '$lib/api/footystats.js';
  import { analyserDC, resultIcon } from '$lib/core/doubleChance.js';

  let matches = [];
  let analyses = [];
  let loading = true;
  let selectedDay = 0; // 0 = aujourd'hui, 1 = demain, 2 = après-demain
  let minH2H = 3;
  let filterSignal = 'all'; // all | fort | moyen

  const days = [
    { label: "Aujourd'hui", offset: 0 },
    { label: 'Demain', offset: 1 },
    { label: 'Après-demain', offset: 2 },
  ];

  function getDateStr(offset) {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return d.toISOString().split('T')[0];
  }

  async function loadMatches() {
    loading = true;
    analyses = [];

    // Charger les matchs des 3 jours
    const allMatches = [];
    for (let i = 0; i <= 2; i++) {
      try {
        const dateStr = getDateStr(i);
        const dayMatches = await getTodaysMatches(dateStr);
        if (Array.isArray(dayMatches)) {
          dayMatches.forEach(m => {
            m._dayOffset = i;
            m._dateStr = dateStr;
          });
          allMatches.push(...dayMatches);
        }
      } catch {}
    }
    matches = allMatches;

    // Analyser les H2H pour chaque match
    const results = [];
    // Grouper les matchs par competition_id pour éviter les appels dupliqués
    const leagueMatchesCache = {};

    for (const m of matches) {
      try {
        const leagueId = m.competition_id || m.league_id;
        if (!leagueId) continue;

        // Charger les matchs de la ligue (caché)
        if (!leagueMatchesCache[leagueId]) {
          leagueMatchesCache[leagueId] = await getLeagueMatches(leagueId);
        }
        const leagueMatches = leagueMatchesCache[leagueId];

        // Filtrer les H2H
        const h2h = leagueMatches.filter(lm =>
          lm.status === 'complete' && (
            (lm.homeID === m.homeID && lm.awayID === m.awayID) ||
            (lm.homeID === m.awayID && lm.awayID === m.homeID)
          )
        );

        const dc = analyserDC(h2h, m.homeID, m.awayID);

        results.push({
          match: m,
          dc,
          homeName: m.home_name || 'Home',
          awayName: m.away_name || 'Away',
          dayOffset: m._dayOffset,
          dateStr: m._dateStr,
          time: m.date_unix ? new Date(m.date_unix * 1000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—',
        });
      } catch {}
    }

    analyses = results;
    loading = false;
  }

  // Filtres
  $: filteredAnalyses = analyses.filter(a => {
    if (selectedDay !== -1 && a.dayOffset !== selectedDay) return false;
    if (a.dc.nbH2H < minH2H) return false;
    if (filterSignal === 'fort' && a.dc.teamA.defeatPct > 20 && a.dc.teamB.defeatPct > 20) return false;
    if (filterSignal === 'moyen' && a.dc.teamA.defeatPct > 35 && a.dc.teamB.defeatPct > 35) return false;
    return a.dc.hasData;
  }).sort((a, b) => {
    // Trier par plus bas % défaite H2H (meilleur signal DC en premier)
    const minA = Math.min(a.dc.teamA.defeatPct, a.dc.teamB.defeatPct);
    const minB = Math.min(b.dc.teamA.defeatPct, b.dc.teamB.defeatPct);
    return minA - minB;
  });

  $: totalWithH2H = analyses.filter(a => a.dc.hasData && a.dc.nbH2H >= minH2H).length;

  function signalClass(signal) {
    if (signal === 'fort') return 'dc-signal--fort';
    if (signal === 'moyen') return 'dc-signal--moyen';
    return 'dc-signal--faible';
  }

  function pctColor(pct) {
    if (pct >= 70) return 'var(--color-accent-green)';
    if (pct >= 55) return 'var(--color-signal-moyen)';
    return 'var(--color-text-muted)';
  }

  // Pour le % défaite : bas = vert (bon), haut = rouge (mauvais)
  function defeatColor(pct) {
    if (pct <= 20) return 'var(--color-accent-green)';
    if (pct <= 35) return 'var(--color-signal-moyen)';
    return 'var(--color-danger)';
  }

  // Expand
  let expandedMatch = null;
  function toggleExpand(matchId) {
    expandedMatch = expandedMatch === matchId ? null : matchId;
  }

  onMount(() => {
    loadMatches();
  });

  $: if (!$isDemo) loadMatches();
</script>

<div class="page-title">🎯 Double Chance — Analyse H2H</div>
<div class="page-subtitle">
  Analyse des confrontations directes sur les 3 prochains jours
  {#if !loading} — {totalWithH2H} match{totalWithH2H > 1 ? 's' : ''} avec H2H{/if}
</div>

<!-- Filtres -->
<div class="dc-filters">
  <div class="dc-filter-group">
    {#each days as day, i}
      <button class="dc-filter-btn" class:active={selectedDay === i}
        on:click={() => selectedDay = i}>
        {day.label}
      </button>
    {/each}
    <button class="dc-filter-btn" class:active={selectedDay === -1}
      on:click={() => selectedDay = -1}>
      Tous
    </button>
  </div>

  <div class="dc-filter-group">
    <button class="dc-filter-btn" class:active={filterSignal === 'all'} on:click={() => filterSignal = 'all'}>Tous</button>
    <button class="dc-filter-btn" class:active={filterSignal === 'moyen'} on:click={() => filterSignal = 'moyen'}>Signal+</button>
    <button class="dc-filter-btn" class:active={filterSignal === 'fort'} on:click={() => filterSignal = 'fort'}>Forts</button>
  </div>

  <div class="dc-filter-group">
    <label class="dc-filter-label">Min H2H :</label>
    <select class="form-input dc-select" bind:value={minH2H}>
      <option value={1}>1+</option>
      <option value={2}>2+</option>
      <option value={3}>3+</option>
      <option value={5}>5+</option>
    </select>
  </div>
</div>

{#if loading}
  <div class="empty-state" style="padding:40px;">
    <div class="empty-state__icon">⏳</div>
    <div class="empty-state__title">Chargement des matchs et H2H...</div>
    <div style="font-size:12px;color:var(--color-text-muted);margin-top:8px;">
      Analyse des confrontations directes en cours
    </div>
  </div>
{:else if filteredAnalyses.length === 0}
  <div class="empty-state" style="padding:40px;">
    <div class="empty-state__icon">🔍</div>
    <div class="empty-state__title">Aucun match avec H2H suffisant</div>
    <div style="font-size:12px;color:var(--color-text-muted);margin-top:8px;">
      Essayez de réduire le minimum H2H ou de changer le jour
    </div>
  </div>
{:else}
  <div class="dc-list">
    {#each filteredAnalyses as a (a.match.id)}
      {@const dc = a.dc}
      {@const bestIsHome = dc.bestSide === 'home'}
      {@const bestIsAway = dc.bestSide === 'away'}
      <div class="dc-card" class:dc-card--expanded={expandedMatch === a.match.id}>
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <div class="dc-card__header" on:click={() => toggleExpand(a.match.id)} role="button" tabindex="0">
          <div class="dc-card__time">
            <div class="dc-card__day">{days[a.dayOffset]?.label || a.dateStr}</div>
            <div class="dc-card__hour">{a.time}</div>
          </div>

          <div class="dc-card__teams">
            <div class="dc-card__team" class:dc-card__team--best={bestIsHome}>
              <span class="dc-card__team-name">{a.homeName}</span>
              <span class="dc-badge {signalClass(dc.teamA.signal)}">{dc.teamA.defeatPct}% def.</span>
            </div>
            <span class="dc-card__vs">vs</span>
            <div class="dc-card__team" class:dc-card__team--best={bestIsAway}>
              <span class="dc-card__team-name">{a.awayName}</span>
              <span class="dc-badge {signalClass(dc.teamB.signal)}">{dc.teamB.defeatPct}% def.</span>
            </div>
          </div>

          <div class="dc-card__meta">
            <div class="dc-card__h2h-count">{dc.nbH2H} H2H</div>
          </div>

          <span class="dc-card__arrow">{expandedMatch === a.match.id ? '▼' : '▶'}</span>
        </div>

        {#if expandedMatch === a.match.id}
          <div class="dc-card__body">
            <!-- Stats comparées -->
            <div class="dc-stats-grid">
              <div class="dc-stat-col">
                <div class="dc-stat-col__title">{a.homeName}</div>
                <div class="dc-stat-row">
                  <span class="dc-stat-label">Defaite H2H</span>
                  <span class="dc-stat-value" style:color={defeatColor(dc.teamA.defeatPct)}>
                    <strong>{dc.teamA.defeatPct}%</strong>
                    <small>({dc.teamA.wins}V {dc.teamA.draws}N {dc.teamA.losses}D)</small>
                  </span>
                </div>
                <div class="dc-stat-row">
                  <span class="dc-stat-label">Buts moy. H2H</span>
                  <span class="dc-stat-value">{dc.teamA.avgGoals}</span>
                </div>
                <div class="dc-stat-row">
                  <span class="dc-stat-label">Forme recente</span>
                  <span class="dc-stat-value dc-form">
                    {#each dc.teamA.recentForm.split('') as r}{resultIcon(r)}{/each}
                  </span>
                </div>
              </div>

              <div class="dc-stat-col dc-stat-col--center">
                <div class="dc-stat-col__title">H2H</div>
                <div class="dc-stat-row">
                  <span class="dc-stat-label">Matchs</span>
                  <span class="dc-stat-value"><strong>{dc.nbH2H}</strong></span>
                </div>
                <div class="dc-stat-row">
                  <span class="dc-stat-label">Buts moy.</span>
                  <span class="dc-stat-value"><strong>{dc.avgGoals}</strong></span>
                </div>
                <div class="dc-stat-row">
                  <span class="dc-stat-label">MT ≠ FT</span>
                  <span class="dc-stat-value" style:color={pctColor(dc.htFtChangePct)}>
                    <strong>{dc.htFtChangePct}%</strong>
                  </span>
                </div>
              </div>

              <div class="dc-stat-col">
                <div class="dc-stat-col__title">{a.awayName}</div>
                <div class="dc-stat-row">
                  <span class="dc-stat-label">Defaite H2H</span>
                  <span class="dc-stat-value" style:color={defeatColor(dc.teamB.defeatPct)}>
                    <strong>{dc.teamB.defeatPct}%</strong>
                    <small>({dc.teamB.wins}V {dc.teamB.draws}N {dc.teamB.losses}D)</small>
                  </span>
                </div>
                <div class="dc-stat-row">
                  <span class="dc-stat-label">Buts moy. H2H</span>
                  <span class="dc-stat-value">{dc.teamB.avgGoals}</span>
                </div>
                <div class="dc-stat-row">
                  <span class="dc-stat-label">Forme recente</span>
                  <span class="dc-stat-value dc-form">
                    {#each dc.teamB.recentForm.split('') as r}{resultIcon(r)}{/each}
                  </span>
                </div>
              </div>
            </div>

            <!-- Historique H2H détaillé -->
            <div class="dc-h2h-history">
              <div class="dc-h2h-title">Derniers H2H</div>
              {#each dc.results.slice().reverse() as r}
                <div class="dc-h2h-row">
                  <span class="dc-h2h-date">
                    {r.date ? r.date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'}
                  </span>
                  <span class="dc-h2h-teams">
                    <span class:dc-h2h-winner={r.teamAResult === 'W'}>{r.isHomeTeamA ? r.homeName : r.awayName}</span>
                    <span class="dc-h2h-score">{r.scoreFT}</span>
                    <span class:dc-h2h-winner={r.teamBResult === 'W'}>{r.isHomeTeamA ? r.awayName : r.homeName}</span>
                  </span>
                  <span class="dc-h2h-ht">MT: {r.scoreHT}</span>
                  {#if r.htFtChanged}
                    <span class="dc-h2h-tag">MT≠FT</span>
                  {/if}
                  {#if r.comebackA || r.comebackB}
                    <span class="dc-h2h-tag dc-h2h-tag--comeback">Comeback</span>
                  {/if}
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    {/each}
  </div>
{/if}

<style>
  .dc-filters {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    align-items: center;
    margin-bottom: 20px;
  }
  .dc-filter-group {
    display: flex;
    gap: 4px;
    align-items: center;
  }
  .dc-filter-btn {
    background: rgba(255,255,255,0.05);
    border: 1px solid var(--color-border);
    border-radius: 6px;
    padding: 5px 12px;
    font-size: 12px;
    color: var(--color-text-muted);
    cursor: pointer;
    transition: all 0.15s;
  }
  .dc-filter-btn.active {
    background: var(--color-accent-blue);
    border-color: var(--color-accent-blue);
    color: white;
  }
  .dc-filter-label {
    font-size: 12px;
    color: var(--color-text-muted);
  }
  .dc-select {
    width: 60px;
    padding: 4px 8px;
    font-size: 12px;
  }
  .dc-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .dc-card {
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: 10px;
    overflow: hidden;
    transition: border-color 0.2s;
  }
  .dc-card--expanded {
    border-color: var(--color-accent-blue);
  }
  .dc-card__header {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 12px 16px;
    cursor: pointer;
    transition: background 0.15s;
  }
  .dc-card__header:hover {
    background: rgba(255,255,255,0.02);
  }
  .dc-card__time {
    min-width: 70px;
    text-align: center;
  }
  .dc-card__day {
    font-size: 10px;
    color: var(--color-text-muted);
    text-transform: uppercase;
  }
  .dc-card__hour {
    font-size: 14px;
    font-weight: 600;
  }
  .dc-card__teams {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .dc-card__team {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
    min-width: 0;
  }
  .dc-card__team--best {
    font-weight: 600;
  }
  .dc-card__team-name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 13px;
  }
  .dc-card__vs {
    font-size: 11px;
    color: var(--color-text-muted);
    flex-shrink: 0;
  }
  .dc-badge {
    font-size: 11px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 4px;
    flex-shrink: 0;
  }
  .dc-signal--fort {
    background: rgba(29, 158, 117, 0.15);
    color: var(--color-accent-green);
  }
  .dc-signal--moyen {
    background: rgba(239, 159, 39, 0.15);
    color: var(--color-signal-moyen);
  }
  .dc-signal--faible {
    background: rgba(255,255,255,0.05);
    color: var(--color-text-muted);
  }
  .dc-card__meta {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
    flex-shrink: 0;
  }
  .dc-card__h2h-count {
    font-size: 11px;
    color: var(--color-text-muted);
  }
  .dc-card__odds {
    display: flex;
    gap: 8px;
    font-size: 11px;
    color: var(--color-accent-blue);
  }
  .dc-card__arrow {
    font-size: 11px;
    color: var(--color-text-muted);
    flex-shrink: 0;
  }

  /* Body expand */
  .dc-card__body {
    border-top: 1px solid var(--color-border);
    padding: 16px;
  }
  .dc-stats-grid {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    gap: 16px;
    margin-bottom: 16px;
  }
  .dc-stat-col {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .dc-stat-col--center {
    align-items: center;
    justify-content: flex-start;
    padding-top: 24px;
    min-width: 80px;
  }
  .dc-stat-col__title {
    font-size: 12px;
    font-weight: 600;
    color: var(--color-text-primary);
    margin-bottom: 4px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .dc-stat-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    font-size: 12px;
  }
  .dc-stat-label {
    color: var(--color-text-muted);
    white-space: nowrap;
  }
  .dc-stat-value {
    text-align: right;
    white-space: nowrap;
  }
  .dc-stat-value small {
    color: var(--color-text-muted);
    font-size: 10px;
  }
  .dc-form {
    font-size: 14px;
    letter-spacing: 2px;
  }

  /* H2H History */
  .dc-h2h-history {
    border-top: 1px solid var(--color-border);
    padding-top: 12px;
  }
  .dc-h2h-title {
    font-size: 12px;
    font-weight: 600;
    color: var(--color-text-muted);
    margin-bottom: 8px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }
  .dc-h2h-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 5px 0;
    font-size: 12px;
    border-bottom: 1px solid rgba(255,255,255,0.03);
  }
  .dc-h2h-date {
    color: var(--color-text-muted);
    min-width: 60px;
    font-size: 11px;
  }
  .dc-h2h-teams {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .dc-h2h-score {
    font-weight: 700;
    color: var(--color-text-primary);
    min-width: 30px;
    text-align: center;
  }
  .dc-h2h-winner {
    font-weight: 600;
    color: var(--color-accent-green);
  }
  .dc-h2h-ht {
    font-size: 11px;
    color: var(--color-text-muted);
    min-width: 50px;
  }
  .dc-h2h-tag {
    font-size: 9px;
    font-weight: 600;
    padding: 1px 5px;
    border-radius: 3px;
    background: rgba(55, 138, 221, 0.15);
    color: var(--color-accent-blue);
    text-transform: uppercase;
  }
  .dc-h2h-tag--comeback {
    background: rgba(239, 159, 39, 0.15);
    color: var(--color-signal-moyen);
  }

  @media (max-width: 768px) {
    .dc-stats-grid {
      grid-template-columns: 1fr;
    }
    .dc-stat-col--center {
      padding-top: 0;
      flex-direction: row;
      gap: 16px;
    }
    .dc-card__teams {
      flex-direction: column;
      gap: 2px;
      align-items: flex-start;
    }
    .dc-card__vs {
      display: none;
    }
    .dc-card__odds {
      flex-direction: column;
      gap: 0;
    }
  }
</style>
