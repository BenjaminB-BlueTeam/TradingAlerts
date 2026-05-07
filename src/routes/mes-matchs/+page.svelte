<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/api/supabase.js';
  import { selectedKeys, keyOf } from '$lib/stores/selectionStore.js';
  import { getDateStr, formatDateDMY, formatTime, isInPlay } from '$lib/utils/formatters.js';
  import SelectAlertButton from '$lib/components/SelectAlertButton.svelte';

  let allAlerts = $state([]);
  let loading = $state(true);
  let error = $state('');


  // Filtrage reactif : dès qu'une alerte est désélectionnée, elle disparaît
  let visibleAlerts = $derived(
    allAlerts.filter(a => $selectedKeys.has(keyOf(a.match_id, a.signal_type)))
  );

  let today = $derived(getDateStr(0));

  const CONF_ORDER = { fort_double: 0, fort: 1, moyen: 2 };

  let sections = $derived.by(() => {
    const coming = [];
    const todays = [];
    const past = [];

    for (const a of visibleAlerts) {
      if (a.match_date > today) coming.push(a);
      else if (a.match_date === today) todays.push(a);
      else past.push(a);
    }

    // Tri ascendant pour à venir et aujourd'hui (le plus tôt en haut)
    coming.sort((a, b) => {
      if (a.match_date !== b.match_date) return a.match_date < b.match_date ? -1 : 1;
      const ca = CONF_ORDER[a.confidence] ?? 99;
      const cb = CONF_ORDER[b.confidence] ?? 99;
      if (ca !== cb) return ca - cb;
      return (a.kickoff_unix || 0) - (b.kickoff_unix || 0);
    });
    todays.sort((a, b) => {
      const ca = CONF_ORDER[a.confidence] ?? 99;
      const cb = CONF_ORDER[b.confidence] ?? 99;
      if (ca !== cb) return ca - cb;
      return (a.kickoff_unix || 0) - (b.kickoff_unix || 0);
    });
    // Tri descendant pour passés (le plus récent en haut)
    past.sort((a, b) => {
      if (a.match_date !== b.match_date) return b.match_date < a.match_date ? -1 : 1;
      return (b.kickoff_unix || 0) - (a.kickoff_unix || 0);
    });

    return { coming, todays, past };
  });

  async function loadAlertsForSelections() {
    loading = true;
    error = '';
    const set = $selectedKeys;

    if (set.size === 0) {
      allAlerts = [];
      loading = false;
      return;
    }

    // Extraire les match_ids uniques depuis les clés "matchId:signalType"
    const matchIds = [...new Set([...set].map(k => k.split(':')[0]))];

    const { data, error: dbError } = await supabase
      .from('alerts')
      .select('*')
      .in('match_id', matchIds);

    if (dbError) {
      console.error('mes-matchs loadAlerts:', dbError);
      error = 'Impossible de charger les alertes sélectionnées.';
      allAlerts = [];
    } else {
      allAlerts = data || [];
    }
    loading = false;
  }

  function confidenceClass(c) {
    return (c === 'fort' || c === 'fort_double') ? 'alert-badge--fort' : 'alert-badge--moyen';
  }

  onMount(() => {
    loadAlertsForSelections();
  });
</script>

<div class="page-header">
  <h1 class="page-title">Mes matchs</h1>
  <p class="page-subtitle">
    {visibleAlerts.length} alerte{visibleAlerts.length !== 1 ? 's' : ''} sélectionnée{visibleAlerts.length !== 1 ? 's' : ''} — FHG, LG2
  </p>
</div>


{#if error}
  <p class="error-msg">{error}</p>
{/if}

{#if loading}
  <div class="empty-state" style="padding:40px;">
    <div class="empty-state__icon">⏳</div>
    <div class="empty-state__title">Chargement...</div>
  </div>

{:else if visibleAlerts.length === 0}
  <div class="empty-state" style="padding:48px;">
    <div class="empty-state__icon">⭐</div>
    <div class="empty-state__title">Aucune alerte sélectionnée</div>
    <div class="empty-state__desc">
      Va sur <a href="/alerts">Sélection FHG</a> ou <a href="/alerts-lg2">Sélection LG2</a> pour faire ta première sélection.
    </div>
  </div>

{:else}
  <div class="mes-matchs-sections">

    {#if sections.coming.length > 0}
      <section class="mes-section">
        <h2 class="mes-section__title">
          <span class="mes-section__badge mes-section__badge--coming">{sections.coming.length}</span>
          A venir
        </h2>
        <div class="alerts-list">
          {#each sections.coming as a (a.id)}
            <div
              class="alert-card"
              class:alert-card--validated={a.status === 'validated'}
              class:alert-card--lost={a.status === 'lost'}
              class:alert-card--live={a.status === 'pending' && isInPlay(a)}
            >
              <div class="alert-card__header alert-card__header--static">
                <div class="alert-card__time">
                  <div class="alert-card__day">{formatDateDMY(a.match_date)}</div>
                  <div class="alert-card__hour">{formatTime(a.kickoff_unix)}</div>
                </div>
                <div class="alert-card__match">
                  <div class="alert-card__teams">{a.home_team_name} vs {a.away_team_name}</div>
                  <div class="alert-card__league">{a.league_name || '—'}</div>
                </div>
                <div class="alert-card__badges">
                  <span class="alert-badge alert-badge--signal">{a.signal_type}</span>
                  <span class="alert-badge {confidenceClass(a.confidence)}">{a.confidence}</span>
                  {#if a.status === 'validated'}
                    <span class="alert-badge alert-badge--validated">Valide</span>
                  {:else if a.status === 'lost'}
                    <span class="alert-badge alert-badge--lost">Perdu</span>
                  {:else if isInPlay(a)}
                    <span class="alert-badge alert-badge--live">EN COURS</span>
                  {/if}
                  <SelectAlertButton alert={a}  />
                </div>
              </div>
            </div>
          {/each}
        </div>
      </section>
    {/if}

    {#if sections.todays.length > 0}
      <section class="mes-section">
        <h2 class="mes-section__title">
          <span class="mes-section__badge mes-section__badge--today">{sections.todays.length}</span>
          Aujourd'hui
        </h2>
        <div class="alerts-list">
          {#each sections.todays as a (a.id)}
            <div
              class="alert-card"
              class:alert-card--validated={a.status === 'validated'}
              class:alert-card--lost={a.status === 'lost'}
              class:alert-card--live={a.status === 'pending' && isInPlay(a)}
            >
              <div class="alert-card__header alert-card__header--static">
                <div class="alert-card__time">
                  <div class="alert-card__day">{formatDateDMY(a.match_date)}</div>
                  <div class="alert-card__hour">{formatTime(a.kickoff_unix)}</div>
                </div>
                <div class="alert-card__match">
                  <div class="alert-card__teams">{a.home_team_name} vs {a.away_team_name}</div>
                  <div class="alert-card__league">{a.league_name || '—'}</div>
                </div>
                <div class="alert-card__badges">
                  <span class="alert-badge alert-badge--signal">{a.signal_type}</span>
                  <span class="alert-badge {confidenceClass(a.confidence)}">{a.confidence}</span>
                  {#if a.status === 'validated'}
                    <span class="alert-badge alert-badge--validated">Valide</span>
                  {:else if a.status === 'lost'}
                    <span class="alert-badge alert-badge--lost">Perdu</span>
                  {:else if isInPlay(a)}
                    <span class="alert-badge alert-badge--live">EN COURS</span>
                  {/if}
                  <SelectAlertButton alert={a}  />
                </div>
              </div>
            </div>
          {/each}
        </div>
      </section>
    {/if}

    {#if sections.past.length > 0}
      <section class="mes-section">
        <h2 class="mes-section__title">
          <span class="mes-section__badge mes-section__badge--past">{sections.past.length}</span>
          Passes
        </h2>
        <div class="alerts-list">
          {#each sections.past as a (a.id)}
            <div
              class="alert-card"
              class:alert-card--validated={a.status === 'validated'}
              class:alert-card--lost={a.status === 'lost'}
              class:alert-card--live={a.status === 'pending' && isInPlay(a)}
            >
              <div class="alert-card__header alert-card__header--static">
                <div class="alert-card__time">
                  <div class="alert-card__day">{formatDateDMY(a.match_date)}</div>
                  <div class="alert-card__hour">{formatTime(a.kickoff_unix)}</div>
                </div>
                <div class="alert-card__match">
                  <div class="alert-card__teams">{a.home_team_name} vs {a.away_team_name}</div>
                  <div class="alert-card__league">{a.league_name || '—'}</div>
                </div>
                <div class="alert-card__badges">
                  <span class="alert-badge alert-badge--signal">{a.signal_type}</span>
                  <span class="alert-badge {confidenceClass(a.confidence)}">{a.confidence}</span>
                  {#if a.status === 'validated'}
                    <span class="alert-badge alert-badge--validated">Valide</span>
                  {:else if a.status === 'lost'}
                    <span class="alert-badge alert-badge--lost">Perdu</span>
                  {:else if isInPlay(a)}
                    <span class="alert-badge alert-badge--live">EN COURS</span>
                  {/if}
                  <SelectAlertButton alert={a}  />
                </div>
              </div>
            </div>
          {/each}
        </div>
      </section>
    {/if}

  </div>
{/if}

<style>
  .page-header {
    margin-bottom: 20px;
  }

  .cascade-msg {
    font-size: 12px;
    padding: 6px 12px;
    margin-bottom: 10px;
    border-radius: 6px;
    background: rgba(239, 159, 39, 0.08);
    color: var(--color-warning-orange);
    border: 1px solid rgba(239, 159, 39, 0.2);
  }

  .error-msg {
    color: var(--color-danger);
    font-size: 13px;
    margin-bottom: 12px;
  }

  .mes-matchs-sections {
    display: flex;
    flex-direction: column;
    gap: 28px;
  }

  .mes-section__title {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 13px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--color-text-secondary);
    margin-bottom: 10px;
  }

  .mes-section__badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 22px;
    height: 22px;
    border-radius: 11px;
    font-size: 11px;
    font-weight: 700;
    padding: 0 6px;
  }

  .mes-section__badge--coming {
    background: rgba(61, 138, 221, 0.18);
    color: var(--color-accent-blue);
  }

  .mes-section__badge--today {
    background: rgba(29, 158, 117, 0.18);
    color: var(--color-accent-green);
  }

  .mes-section__badge--past {
    background: rgba(160, 163, 177, 0.12);
    color: var(--color-text-muted);
  }

  .alerts-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  /* Card sans expand — pas de cursor:pointer sur le header */
  .alert-card__header--static {
    cursor: default;
  }
  .alert-card__header--static:hover {
    background: transparent;
  }

  .empty-state__desc {
    font-size: 13px;
    color: var(--color-text-muted);
    margin-top: 10px;
    line-height: 1.6;
  }

  .empty-state__desc a {
    color: var(--color-accent-blue);
  }

  @media (max-width: 768px) {
    .alert-card__header {
      flex-wrap: wrap;
    }
    .alert-card__badges {
      flex-wrap: wrap;
      width: 100%;
    }
  }
</style>
