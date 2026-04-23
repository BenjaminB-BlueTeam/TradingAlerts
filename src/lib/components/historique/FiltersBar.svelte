<script>
  let {
    filters = $bindable(),
    availableTeams = [],
    availableLeagues = [],
  } = $props();

  const STRATEGIES = [
    { key: 'tous', label: 'Tous' },
    { key: 'fhg',  label: 'FHG'  },
    { key: 'dc',   label: 'DC'   },
    { key: 'lg2',  label: 'LG2'  },
  ];

  const CONFIDENCES = [
    { key: 'tous',        label: 'Toutes'     },
    { key: 'fort_double', label: 'fort_double' },
    { key: 'fort',        label: 'fort'       },
    { key: 'moyen',       label: 'moyen'      },
  ];

  const STATUSES = [
    { key: 'tous',       label: 'Toutes'       },
    { key: 'terminees',  label: 'Terminées'    },
    { key: 'validated',  label: 'Validées'     },
    { key: 'lost',       label: 'Perdues'      },
    { key: 'encours',    label: 'En attente'   },
  ];

  const PRESETS = [
    { label: '7j',   days: 7   },
    { label: '30j',  days: 30  },
    { label: '90j',  days: 90  },
    { label: '1 an', days: 365 },
    { label: 'Tout', days: null },
  ];

  function applyPreset(days) {
    if (days === null) {
      filters.dateFrom = null;
      filters.dateTo = null;
      return;
    }
    const d = new Date();
    d.setDate(d.getDate() - days);
    filters.dateFrom = d.toISOString().split('T')[0];
    filters.dateTo = null;
  }

  function activePreset() {
    if (!filters.dateFrom && !filters.dateTo) return 'Tout';
    if (filters.dateTo) return null;
    const from = new Date(filters.dateFrom);
    const today = new Date();
    today.setHours(0,0,0,0); from.setHours(0,0,0,0);
    const diff = Math.round((today - from) / 86400000);
    const preset = PRESETS.find(p => p.days === diff);
    return preset?.label || null;
  }

  // Recherche équipe / ligue
  let teamQuery = $state('');
  let leagueQuery = $state('');
  let teamDropdownOpen = $state(false);
  let leagueDropdownOpen = $state(false);

  let filteredTeams = $derived(
    (availableTeams || []).filter(t =>
      teamQuery === '' || t.teamName.toLowerCase().includes(teamQuery.toLowerCase())
    ).slice(0, 30)
  );

  let filteredLeagues = $derived(
    (availableLeagues || []).filter(l =>
      leagueQuery === '' || l.toLowerCase().includes(leagueQuery.toLowerCase())
    )
  );

  function selectTeam(team) {
    filters.team = team.teamId;
    teamQuery = team.teamName;
    teamDropdownOpen = false;
  }

  function clearTeam() {
    filters.team = null;
    teamQuery = '';
  }

  function selectLeague(league) {
    filters.league = league;
    leagueQuery = league;
    leagueDropdownOpen = false;
  }

  function clearLeague() {
    filters.league = null;
    leagueQuery = '';
  }

  // Si `filters.team` change de l'extérieur → mettre à jour le query
  $effect(() => {
    if (filters.team === null && teamQuery !== '') teamQuery = '';
  });
  $effect(() => {
    if (filters.league === null && leagueQuery !== '') leagueQuery = '';
  });
</script>

<div class="filters-bar">
  <!-- PÉRIODE -->
  <div class="filter-row">
    <span class="filter-label">Période</span>
    <input
      type="date"
      class="filter-input"
      bind:value={filters.dateFrom}
      aria-label="Date de début"
    />
    <span class="filter-sep">→</span>
    <input
      type="date"
      class="filter-input"
      bind:value={filters.dateTo}
      aria-label="Date de fin"
    />
    <div class="preset-buttons">
      {#each PRESETS as p}
        <button
          type="button"
          class="preset-btn"
          class:active={activePreset() === p.label}
          onclick={() => applyPreset(p.days)}
        >{p.label}</button>
      {/each}
    </div>
  </div>

  <!-- STRATÉGIE + CONFIDENCE + STATUT -->
  <div class="filter-row">
    <span class="filter-label">Stratégie</span>
    <div class="btn-group">
      {#each STRATEGIES as s}
        <button type="button" class="chip" class:active={filters.strategy === s.key}
          onclick={() => filters.strategy = s.key}>{s.label}</button>
      {/each}
    </div>
    <span class="filter-label">Confidence</span>
    <div class="btn-group">
      {#each CONFIDENCES as c}
        <button type="button" class="chip" class:active={filters.confidence === c.key}
          onclick={() => filters.confidence = c.key}>{c.label}</button>
      {/each}
    </div>
    <span class="filter-label">Statut</span>
    <div class="btn-group">
      {#each STATUSES as s}
        <button type="button" class="chip" class:active={filters.status === s.key}
          onclick={() => filters.status = s.key}>{s.label}</button>
      {/each}
    </div>
  </div>

  <!-- ÉQUIPE + LIGUE -->
  <div class="filter-row">
    <span class="filter-label">Équipe</span>
    <div class="dropdown">
      <input
        type="text"
        class="filter-input"
        placeholder="Rechercher une équipe..."
        bind:value={teamQuery}
        onfocus={() => teamDropdownOpen = true}
        oninput={() => teamDropdownOpen = true}
      />
      {#if filters.team !== null}
        <button type="button" class="clear-btn" onclick={clearTeam} aria-label="Effacer">✕</button>
      {/if}
      {#if teamDropdownOpen && filteredTeams.length > 0}
        <ul class="dropdown-menu" role="listbox">
          {#each filteredTeams as t}
            <li>
              <button type="button" class="dropdown-item" onclick={() => selectTeam(t)}>
                {t.teamName} <span class="muted">({t.total})</span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>

    <span class="filter-label">Ligue</span>
    <div class="dropdown">
      <input
        type="text"
        class="filter-input"
        placeholder="Rechercher une ligue..."
        bind:value={leagueQuery}
        onfocus={() => leagueDropdownOpen = true}
        oninput={() => leagueDropdownOpen = true}
      />
      {#if filters.league !== null}
        <button type="button" class="clear-btn" onclick={clearLeague} aria-label="Effacer">✕</button>
      {/if}
      {#if leagueDropdownOpen && filteredLeagues.length > 0}
        <ul class="dropdown-menu" role="listbox">
          {#each filteredLeagues as l}
            <li>
              <button type="button" class="dropdown-item" onclick={() => selectLeague(l)}>{l}</button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </div>
</div>

<!-- Ferme les dropdowns au clic à l'extérieur -->
<svelte:window onclick={(e) => {
  if (!e.target.closest?.('.dropdown')) {
    teamDropdownOpen = false;
    leagueDropdownOpen = false;
  }
}} />

<style>
  .filters-bar {
    position: sticky;
    top: 0;
    z-index: 10;
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: 10px;
    padding: 10px 14px;
    margin-bottom: 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .filter-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .filter-label {
    font-size: 11px;
    color: var(--color-text-muted);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    white-space: nowrap;
  }
  .filter-input {
    background: rgba(255,255,255,0.04);
    border: 1px solid var(--color-border);
    border-radius: 6px;
    padding: 5px 10px;
    color: var(--color-text-primary);
    font-size: 12px;
    min-width: 160px;
  }
  .filter-input:focus {
    outline: none;
    border-color: var(--color-accent-blue);
  }
  .filter-sep { color: var(--color-text-muted); }
  .preset-buttons { display: flex; gap: 4px; margin-left: auto; }
  .preset-btn {
    background: rgba(255,255,255,0.04);
    border: 1px solid var(--color-border);
    border-radius: 6px;
    padding: 4px 8px;
    color: var(--color-text-muted);
    font-size: 11px;
    cursor: pointer;
  }
  .preset-btn.active {
    background: var(--color-accent-blue);
    border-color: var(--color-accent-blue);
    color: #fff;
  }
  .btn-group { display: flex; gap: 3px; flex-wrap: wrap; }
  .chip {
    background: rgba(255,255,255,0.04);
    border: 1px solid var(--color-border);
    border-radius: 5px;
    padding: 4px 9px;
    font-size: 11px;
    color: var(--color-text-muted);
    cursor: pointer;
  }
  .chip.active {
    background: var(--color-accent-blue);
    border-color: var(--color-accent-blue);
    color: #fff;
  }

  .dropdown { position: relative; }
  .clear-btn {
    position: absolute;
    right: 6px;
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    color: var(--color-text-muted);
    cursor: pointer;
    font-size: 12px;
  }
  .dropdown-menu {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: 6px;
    max-height: 260px;
    overflow-y: auto;
    margin: 0;
    padding: 4px 0;
    list-style: none;
    z-index: 15;
    box-shadow: 0 4px 18px rgba(0,0,0,0.3);
  }
  .dropdown-item {
    width: 100%;
    background: none;
    border: none;
    padding: 6px 12px;
    font-size: 12px;
    text-align: left;
    cursor: pointer;
    color: var(--color-text-primary);
  }
  .dropdown-item:hover { background: rgba(55,138,221,0.12); }
  .muted { color: var(--color-text-muted); font-size: 11px; }

  @media (max-width: 768px) {
    .filter-row { flex-direction: column; align-items: stretch; }
    .preset-buttons { margin-left: 0; justify-content: flex-start; }
    .filter-input { min-width: 0; width: 100%; }
  }
</style>
