<script>
  import { onMount } from 'svelte';
  import { isDemo, leagues, saveWatchlist } from '$lib/stores/appStore.js';
  import { getTodaysMatches } from '$lib/api/footystats.js';
  import { getH2HForAnalysis } from '$lib/api/supabase.js';
  import { analyserDC, resultIcon } from '$lib/core/doubleChance.js';

  let loading = true;
  let selectedDay = -1; // -1 = tous, 0/1/2 = jour
  let fhgAlerts = [];
  let dcAlerts = [];
  let useDB = true; // Utiliser Supabase pour les H2H

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

  function formatTime(unix) {
    if (!unix) return '—';
    return new Date(unix * 1000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  async function loadAlerts() {
    loading = true;
    fhgAlerts = [];
    dcAlerts = [];

    // Charger les matchs des 3 jours
    const allMatches = [];
    for (let i = 0; i <= 2; i++) {
      try {
        const dateStr = getDateStr(i);
        const dayMatches = await getTodaysMatches(dateStr);
        if (Array.isArray(dayMatches)) {
          dayMatches.forEach(m => { m._dayOffset = i; m._dateStr = dateStr; });
          allMatches.push(...dayMatches);
        }
      } catch {}
    }

    // Filtrer : uniquement les matchs des ligues actives
    const activeIds = new Set($leagues.filter(l => l.active).map(l => l.leagueId || l.id));
    const activeNames = new Set($leagues.filter(l => l.active).map(l => l.name));

    const relevantMatches = allMatches.filter(m => {
      const compId = m.competition_id || m.league_id;
      if (activeIds.has(compId)) return true;
      const compName = m.competition_name || m.league_name || '';
      return [...activeNames].some(n => compName.includes(n) || n.includes(compName));
    });

    // Analyser DC + FHG pour chaque match (H2H depuis Supabase)
    const fhgResults = [];
    const dcResults = [];
    const h2hCache = {}; // cache par paire d'équipes

    for (const m of relevantMatches) {
      try {
        if (!m.homeID || !m.awayID) continue;

        // H2H depuis Supabase (toutes saisons, instantané)
        const cacheKey = [m.homeID, m.awayID].sort().join('_');
        if (!h2hCache[cacheKey]) {
          h2hCache[cacheKey] = await getH2HForAnalysis(m.homeID, m.awayID);
        }
        const uniqueH2H = h2hCache[cacheKey];

        const dc = analyserDC(uniqueH2H, m.homeID, m.awayID);

        const entry = {
          match: m,
          dc,
          homeName: m.home_name || 'Home',
          awayName: m.away_name || 'Away',
          leagueName: m.competition_name || m.league_name || '—',
          dayOffset: m._dayOffset,
          dateStr: m._dateStr,
          time: formatTime(m.date_unix),
          nbH2H: dc.nbH2H,
        };

        // FHG : vérifier si historique H2H montre des buts 31-45 min
        // Pour l'instant, on flag FHG si au moins 60% des H2H ont un but en 1MT
        if (dc.hasData && dc.nbH2H >= 3) {
          const matchesWithGoal1MT = uniqueH2H.filter(lm => {
            const htHome = lm.ht_goals_team_a ?? lm.homeGoals_HT ?? 0;
            const htAway = lm.ht_goals_team_b ?? lm.awayGoals_HT ?? 0;
            return (htHome + htAway) > 0;
          }).length;
          const pctGoal1MT = Math.round((matchesWithGoal1MT / uniqueH2H.length) * 100);
          entry.fhgPct = pctGoal1MT;
          entry.fhgSignal = pctGoal1MT >= 75 ? 'fort' : pctGoal1MT >= 60 ? 'moyen' : 'faible';

          if (pctGoal1MT >= 60) {
            fhgResults.push(entry);
          }
        }

        // DC : signal fort ou moyen (défaite ≤ 35%)
        if (dc.hasData && dc.nbH2H >= 3) {
          const bestDefeatPct = Math.min(dc.teamA.defeatPct, dc.teamB.defeatPct);
          if (bestDefeatPct <= 35) {
            dcResults.push(entry);
          }
        }
      } catch {}
    }

    // Trier FHG par % but 1MT décroissant
    fhgAlerts = fhgResults.sort((a, b) => b.fhgPct - a.fhgPct);
    // Trier DC par % défaite croissant (meilleur signal en premier)
    dcAlerts = dcResults.sort((a, b) => {
      const minA = Math.min(a.dc.teamA.defeatPct, a.dc.teamB.defeatPct);
      const minB = Math.min(b.dc.teamA.defeatPct, b.dc.teamB.defeatPct);
      return minA - minB;
    });

    // Sauvegarder tous les matchs alertés dans la watchlist (pour la page Live)
    const allAlertMatches = [...fhgResults, ...dcResults];
    const seen = new Set();
    const watchItems = allAlertMatches.filter(a => {
      if (seen.has(a.match.id)) return false;
      seen.add(a.match.id);
      return true;
    }).map(a => ({
      id: a.match.id,
      homeID: a.match.homeID,
      awayID: a.match.awayID,
      home_name: a.homeName,
      away_name: a.awayName,
      league_name: a.leagueName,
      date_unix: a.match.date_unix,
      dayOffset: a.dayOffset,
      dateStr: a.dateStr,
      signals: [
        ...(fhgResults.find(f => f.match.id === a.match.id) ? ['FHG'] : []),
        ...(dcResults.find(d => d.match.id === a.match.id) ? ['DC'] : []),
      ],
      fhgPct: fhgResults.find(f => f.match.id === a.match.id)?.fhgPct || null,
      dcDefeatPct: dcResults.find(d => d.match.id === a.match.id)
        ? Math.min(dcResults.find(d => d.match.id === a.match.id).dc.teamA.defeatPct, dcResults.find(d => d.match.id === a.match.id).dc.teamB.defeatPct)
        : null,
    }));
    saveWatchlist(watchItems);

    loading = false;
  }

  $: filteredFHG = selectedDay === -1 ? fhgAlerts : fhgAlerts.filter(a => a.dayOffset === selectedDay);
  $: filteredDC = selectedDay === -1 ? dcAlerts : dcAlerts.filter(a => a.dayOffset === selectedDay);

  function defeatColor(pct) {
    if (pct <= 20) return 'var(--color-accent-green)';
    if (pct <= 35) return 'var(--color-signal-moyen)';
    return 'var(--color-danger)';
  }

  function fhgColor(pct) {
    if (pct >= 75) return 'var(--color-accent-green)';
    if (pct >= 60) return 'var(--color-signal-moyen)';
    return 'var(--color-text-muted)';
  }

  onMount(() => { loadAlerts(); });
  $: if (!$isDemo) loadAlerts();
</script>

<div class="page-title">🔔 Alertes</div>
<div class="page-subtitle">
  Matchs à surveiller — H2H sur 5 saisons, ligues actives uniquement
</div>

<!-- Filtres jours -->
<div class="alerts-filters">
  <button class="alerts-filter-btn" class:active={selectedDay === -1} on:click={() => selectedDay = -1}>
    Tous ({fhgAlerts.length + dcAlerts.length})
  </button>
  {#each days as day, i}
    <button class="alerts-filter-btn" class:active={selectedDay === i} on:click={() => selectedDay = i}>
      {day.label}
    </button>
  {/each}
</div>

{#if loading}
  <div class="empty-state" style="padding:40px;">
    <div class="empty-state__icon">⏳</div>
    <div class="empty-state__title">Analyse des matchs en cours...</div>
    <div style="font-size:12px;color:var(--color-text-muted);margin-top:8px;">
      Chargement des H2H sur 5 saisons
    </div>
  </div>
{:else}

  <!-- SECTION FHG -->
  <div class="alerts-section">
    <div class="alerts-section__header">
      <span class="alerts-section__icon">⚽</span>
      <span class="alerts-section__title">FHG — But en 1re mi-temps</span>
      <span class="alerts-section__count">{filteredFHG.length}</span>
    </div>

    {#if filteredFHG.length === 0}
      <div class="alerts-empty">Aucun match FHG pertinent</div>
    {:else}
      <div class="alerts-list">
        {#each filteredFHG as a (a.match.id + '_fhg')}
          <div class="alert-card">
            <div class="alert-card__time">
              <div class="alert-card__day">{days[a.dayOffset]?.label || a.dateStr}</div>
              <div class="alert-card__hour">{a.time}</div>
            </div>
            <div class="alert-card__match">
              <div class="alert-card__teams">{a.homeName} vs {a.awayName}</div>
              <div class="alert-card__league">{a.leagueName}</div>
            </div>
            <div class="alert-card__stats">
              <div class="alert-pill" title="% de H2H avec but en 1MT">
                <span class="alert-pill__label">But 1MT</span>
                <span class="alert-pill__value" style:color={fhgColor(a.fhgPct)}>{a.fhgPct}%</span>
              </div>
              <div class="alert-pill" title="Nombre de H2H analysés">
                <span class="alert-pill__label">H2H</span>
                <span class="alert-pill__value">{a.nbH2H}</span>
              </div>
              <div class="alert-pill" title="Buts moyens par H2H">
                <span class="alert-pill__label">Avg</span>
                <span class="alert-pill__value">{a.dc.avgGoals}</span>
              </div>
            </div>
            <span class="alert-badge alert-badge--{a.fhgSignal}">{a.fhgSignal}</span>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- SECTION DC -->
  <div class="alerts-section">
    <div class="alerts-section__header">
      <span class="alerts-section__icon">🎯</span>
      <span class="alerts-section__title">Double Chance</span>
      <span class="alerts-section__count">{filteredDC.length}</span>
    </div>

    {#if filteredDC.length === 0}
      <div class="alerts-empty">Aucun match DC pertinent</div>
    {:else}
      <div class="alerts-list">
        {#each filteredDC as a (a.match.id + '_dc')}
          {@const bestSide = a.dc.bestSide}
          {@const bestTeam = bestSide === 'home' ? a.dc.teamA : a.dc.teamB}
          {@const bestName = bestSide === 'home' ? a.homeName : a.awayName}
          <div class="alert-card">
            <div class="alert-card__time">
              <div class="alert-card__day">{days[a.dayOffset]?.label || a.dateStr}</div>
              <div class="alert-card__hour">{a.time}</div>
            </div>
            <div class="alert-card__match">
              <div class="alert-card__teams">{a.homeName} vs {a.awayName}</div>
              <div class="alert-card__league">{a.leagueName}</div>
            </div>
            <div class="alert-card__stats">
              <div class="alert-pill" title="% défaite H2H (meilleur côté)">
                <span class="alert-pill__label">Def. {bestName.split(' ')[0]}</span>
                <span class="alert-pill__value" style:color={defeatColor(bestTeam.defeatPct)}>{bestTeam.defeatPct}%</span>
              </div>
              <div class="alert-pill" title="Nombre de H2H analysés">
                <span class="alert-pill__label">H2H</span>
                <span class="alert-pill__value">{a.nbH2H}</span>
              </div>
              <div class="alert-pill" title="% non-défaite">
                <span class="alert-pill__label">Non-def.</span>
                <span class="alert-pill__value" style:color={fhgColor(bestTeam.nonDefeatPct)}>{bestTeam.nonDefeatPct}%</span>
              </div>
            </div>
            <span class="alert-badge alert-badge--{bestTeam.signal}">{bestTeam.signal}</span>
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .alerts-filters {
    display: flex;
    gap: 4px;
    margin-bottom: 20px;
  }
  .alerts-filter-btn {
    background: rgba(255,255,255,0.05);
    border: 1px solid var(--color-border);
    border-radius: 6px;
    padding: 5px 12px;
    font-size: 12px;
    color: var(--color-text-muted);
    cursor: pointer;
    transition: all 0.15s;
  }
  .alerts-filter-btn.active {
    background: var(--color-accent-blue);
    border-color: var(--color-accent-blue);
    color: white;
  }

  .alerts-section {
    margin-bottom: 28px;
  }
  .alerts-section__header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--color-border);
  }
  .alerts-section__icon {
    font-size: 18px;
  }
  .alerts-section__title {
    font-size: 15px;
    font-weight: 600;
  }
  .alerts-section__count {
    background: rgba(255,255,255,0.08);
    color: var(--color-text-muted);
    font-size: 11px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 10px;
    margin-left: auto;
  }

  .alerts-empty {
    padding: 20px;
    text-align: center;
    color: var(--color-text-muted);
    font-size: 13px;
  }

  .alerts-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .alert-card {
    display: flex;
    align-items: center;
    gap: 14px;
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    padding: 10px 14px;
    transition: border-color 0.15s;
  }
  .alert-card:hover {
    border-color: var(--color-accent-blue);
  }

  .alert-card__time {
    min-width: 70px;
    text-align: center;
  }
  .alert-card__day {
    font-size: 10px;
    color: var(--color-text-muted);
    text-transform: uppercase;
  }
  .alert-card__hour {
    font-size: 14px;
    font-weight: 600;
  }

  .alert-card__match {
    flex: 1;
    min-width: 0;
  }
  .alert-card__teams {
    font-size: 13px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .alert-card__league {
    font-size: 11px;
    color: var(--color-text-muted);
    margin-top: 2px;
  }

  .alert-card__stats {
    display: flex;
    gap: 6px;
    flex-shrink: 0;
  }

  .alert-pill {
    display: flex;
    flex-direction: column;
    align-items: center;
    background: rgba(255,255,255,0.04);
    border-radius: 6px;
    padding: 3px 8px;
    min-width: 48px;
  }
  .alert-pill__label {
    font-size: 9px;
    font-weight: 600;
    text-transform: uppercase;
    color: var(--color-text-muted);
    letter-spacing: 0.3px;
  }
  .alert-pill__value {
    font-size: 13px;
    font-weight: 700;
  }

  .alert-badge {
    font-size: 10px;
    font-weight: 700;
    padding: 3px 8px;
    border-radius: 4px;
    text-transform: uppercase;
    flex-shrink: 0;
  }
  .alert-badge--fort {
    background: rgba(29, 158, 117, 0.15);
    color: var(--color-accent-green);
  }
  .alert-badge--moyen {
    background: rgba(239, 159, 39, 0.15);
    color: var(--color-signal-moyen);
  }
  .alert-badge--faible {
    background: rgba(255,255,255,0.05);
    color: var(--color-text-muted);
  }

  @media (max-width: 640px) {
    .alert-card {
      flex-wrap: wrap;
    }
    .alert-card__stats {
      width: 100%;
      justify-content: center;
    }
  }
</style>
