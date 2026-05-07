<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/api/supabase.js';
  import { fetchAlertTrades, insertAlertTrade, deleteAlertTrade } from '$lib/api/supabase.js';
  import { selectedKeys, keyOf } from '$lib/stores/selectionStore.js';
  import { getDateStr, formatDateDMY, formatTime, isInPlay } from '$lib/utils/formatters.js';
  import SelectAlertButton from '$lib/components/SelectAlertButton.svelte';

  // ---- State ----
  let allAlerts = $state([]);
  let allTrades = $state([]);
  let loading = $state(true);
  let error = $state('');
  let terminatedOpen = $state(false);

  // Per-card inline form state: keyed by alertId
  let formCote = $state({});   // { [alertId]: string }
  let formMise = $state({});   // { [alertId]: string }
  let formError = $state({});  // { [alertId]: string }
  let formBusy = $state({});   // { [alertId]: boolean }

  // ---- Helpers: signal classification ----
  function isFHG(signal_type) { return signal_type?.startsWith('FHG'); }
  function isLG2(signal_type) { return signal_type?.startsWith('LG2'); }
  function isTerminated(a) { return ['validated', 'lost', 'expired'].includes(a.status); }
  function isActive(a) { return !isTerminated(a); }

  // ---- Reactive: visible alerts filtered by selected keys ----
  let visibleAlerts = $derived(
    allAlerts.filter(a => $selectedKeys.has(keyOf(a.match_id, a.signal_type)))
  );

  let today = $derived(getDateStr(0));

  const CONF_ORDER = { fort: 0, moyen: 1 };

  function sortActive(list) {
    return [...list].sort((a, b) => {
      if (a.match_date !== b.match_date) return a.match_date < b.match_date ? -1 : 1;
      const ca = CONF_ORDER[a.confidence] ?? 99;
      const cb = CONF_ORDER[b.confidence] ?? 99;
      if (ca !== cb) return ca - cb;
      return (a.kickoff_unix || 0) - (b.kickoff_unix || 0);
    });
  }

  function sortTerminated(list) {
    return [...list].sort((a, b) => {
      if (a.match_date !== b.match_date) return b.match_date < a.match_date ? -1 : 1;
      return (b.kickoff_unix || 0) - (a.kickoff_unix || 0);
    });
  }

  // ---- Derived sections ----
  let sections = $derived.by(() => {
    const fhgActive = visibleAlerts.filter(a => isFHG(a.signal_type) && isActive(a));
    const lg2Active = visibleAlerts.filter(a => isLG2(a.signal_type) && isActive(a));
    const terminated = visibleAlerts.filter(a => isTerminated(a));

    const fhgToday = sortActive(fhgActive.filter(a => a.match_date === today));
    const fhgComing = sortActive(fhgActive.filter(a => a.match_date > today));
    // include past active (match passed but still pending/live, e.g. stuck) in coming-like bucket
    const fhgPastActive = sortActive(fhgActive.filter(a => a.match_date < today));

    const lg2Today = sortActive(lg2Active.filter(a => a.match_date === today));
    const lg2Coming = sortActive(lg2Active.filter(a => a.match_date > today));
    const lg2PastActive = sortActive(lg2Active.filter(a => a.match_date < today));

    return {
      fhgToday, fhgComing, fhgPastActive,
      lg2Today, lg2Coming, lg2PastActive,
      fhgCount: fhgActive.length,
      lg2Count: lg2Active.length,
      terminated: sortTerminated(terminated),
    };
  });

  // ---- Trades helpers ----
  function tradesFor(alert) {
    return allTrades.filter(t => t.match_id === alert.match_id && t.signal_type === alert.signal_type);
  }

  function pnl(trade, alertStatus) {
    if (!trade.mise) return null;
    if (alertStatus === 'validated') return +(trade.mise * (trade.cote - 1)).toFixed(2);
    if (alertStatus === 'lost') return -Number(trade.mise);
    return null;
  }

  function totalPnl(alert) {
    const trades = tradesFor(alert);
    const values = trades.map(t => pnl(t, alert.status)).filter(v => v !== null);
    if (values.length === 0) return null;
    return +values.reduce((s, v) => s + v, 0).toFixed(2);
  }

  // ---- Trade CRUD ----
  async function addTrade(alert) {
    const id = alert.id;
    const coteRaw = (formCote[id] || '').replace(',', '.');
    const miseRaw = (formMise[id] || '').replace(',', '.');
    const cote = parseFloat(coteRaw);
    const mise = miseRaw ? parseFloat(miseRaw) : null;

    if (!coteRaw || isNaN(cote) || cote < 1) {
      formError[id] = 'Cote invalide (min. 1.01)';
      return;
    }
    if (miseRaw && (isNaN(mise) || mise <= 0)) {
      formError[id] = 'Mise invalide';
      return;
    }

    formError[id] = '';
    formBusy[id] = true;
    const row = await insertAlertTrade({
      match_id: alert.match_id,
      signal_type: alert.signal_type,
      cote,
      mise: mise || null,
    });
    formBusy[id] = false;

    if (row) {
      allTrades = [...allTrades, row];
      formCote[id] = '';
      formMise[id] = '';
    } else {
      formError[id] = 'Erreur lors de l\'ajout.';
    }
  }

  async function removeTrade(tradeId) {
    await deleteAlertTrade(tradeId);
    allTrades = allTrades.filter(t => t.id !== tradeId);
  }

  // ---- Data loading ----
  async function loadAlertsForSelections() {
    loading = true;
    error = '';
    const set = $selectedKeys;

    if (set.size === 0) {
      allAlerts = [];
      loading = false;
      return;
    }

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

  async function loadTrades() {
    allTrades = await fetchAlertTrades();
  }

  onMount(() => { loadTrades(); });

  // Recharge les alertes dès que selectedKeys change (fixe la race condition
  // avec loadSelections() du layout qui se termine après le mount de la page)
  $effect(() => {
    void ($selectedKeys);  // établit la dépendance réactive
    loadAlertsForSelections();
  });

  // ---- UI helpers ----
  function confidenceClass(c) {
    return c === 'fort' ? 'alert-badge--fort' : 'alert-badge--moyen';
  }

  function confidenceLabel(c) {
    return c === 'fort' ? 'Fort' : 'Moyen';
  }

  function statusBadge(a) {
    if (a.status === 'validated') return { cls: 'alert-badge--validated', label: 'Valide' };
    if (a.status === 'lost') return { cls: 'alert-badge--lost', label: 'Perdu' };
    if (a.status === 'expired') return { cls: 'alert-badge--lost', label: 'Expiré' };
    if (isInPlay(a)) return { cls: 'alert-badge--live', label: 'EN COURS' };
    return null;
  }

  function formatPnl(value) {
    if (value === null) return '—';
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}€`;
  }
</script>

<div class="page-header">
  <h1 class="page-title">Mes matchs</h1>
  <p class="page-subtitle">
    {visibleAlerts.length} alerte{visibleAlerts.length !== 1 ? 's' : ''} sélectionnée{visibleAlerts.length !== 1 ? 's' : ''} — FHG &amp; LG2
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

    <!-- ============================================================
         SECTION FHG
    ============================================================ -->
    {#if sections.fhgCount > 0}
      <section class="mes-section">
        <h2 class="mes-section__title">
          <span class="mes-section__badge mes-section__badge--fhg">{sections.fhgCount}</span>
          FHG
        </h2>

        {#if sections.fhgToday.length > 0}
          <div class="subsection-label">Aujourd'hui</div>
          <div class="alerts-list">
            {#each sections.fhgToday as a (a.id)}
              {@render alertCard(a)}
            {/each}
          </div>
        {/if}

        {#if sections.fhgComing.length > 0}
          <div class="subsection-label" class:subsection-label--mt={sections.fhgToday.length > 0}>A venir</div>
          <div class="alerts-list">
            {#each sections.fhgComing as a (a.id)}
              {@render alertCard(a)}
            {/each}
          </div>
        {/if}

        {#if sections.fhgPastActive.length > 0}
          <div class="subsection-label" class:subsection-label--mt={sections.fhgToday.length + sections.fhgComing.length > 0}>En attente (passés)</div>
          <div class="alerts-list">
            {#each sections.fhgPastActive as a (a.id)}
              {@render alertCard(a)}
            {/each}
          </div>
        {/if}
      </section>
    {/if}

    <!-- ============================================================
         SECTION LG2
    ============================================================ -->
    {#if sections.lg2Count > 0}
      <section class="mes-section">
        <h2 class="mes-section__title">
          <span class="mes-section__badge mes-section__badge--lg2">{sections.lg2Count}</span>
          LG2
        </h2>

        {#if sections.lg2Today.length > 0}
          <div class="subsection-label">Aujourd'hui</div>
          <div class="alerts-list">
            {#each sections.lg2Today as a (a.id)}
              {@render alertCard(a)}
            {/each}
          </div>
        {/if}

        {#if sections.lg2Coming.length > 0}
          <div class="subsection-label" class:subsection-label--mt={sections.lg2Today.length > 0}>A venir</div>
          <div class="alerts-list">
            {#each sections.lg2Coming as a (a.id)}
              {@render alertCard(a)}
            {/each}
          </div>
        {/if}

        {#if sections.lg2PastActive.length > 0}
          <div class="subsection-label" class:subsection-label--mt={sections.lg2Today.length + sections.lg2Coming.length > 0}>En attente (passés)</div>
          <div class="alerts-list">
            {#each sections.lg2PastActive as a (a.id)}
              {@render alertCard(a)}
            {/each}
          </div>
        {/if}
      </section>
    {/if}

    <!-- ============================================================
         SECTION TERMINEES (collapsible)
    ============================================================ -->
    {#if sections.terminated.length > 0}
      <section class="mes-section">
        <button
          class="mes-section__collapsible"
          onclick={() => (terminatedOpen = !terminatedOpen)}
          aria-expanded={terminatedOpen}
        >
          <span class="mes-section__chevron" class:mes-section__chevron--open={terminatedOpen}>›</span>
          <span class="mes-section__title-text">Termines</span>
          <span class="mes-section__badge mes-section__badge--terminated">{sections.terminated.length}</span>
        </button>

        {#if terminatedOpen}
          <div class="alerts-list" style="margin-top:10px;">
            {#each sections.terminated as a (a.id)}
              {@render alertCard(a)}
            {/each}
          </div>
        {/if}
      </section>
    {/if}

  </div>
{/if}

<!-- ============================================================
     SNIPPET: alert card
============================================================ -->
{#snippet alertCard(a)}
  {@const badge = statusBadge(a)}
  {@const trades = tradesFor(a)}
  {@const total = totalPnl(a)}
  {@const cardId = a.id}
  <div
    class="alert-card"
    class:alert-card--validated={a.status === 'validated'}
    class:alert-card--lost={a.status === 'lost'}
    class:alert-card--live={a.status === 'pending' && isInPlay(a)}
  >
    <!-- Header row -->
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
        <span class="alert-badge {confidenceClass(a.confidence)}">{confidenceLabel(a.confidence)}</span>
        {#if badge}
          <span class="alert-badge {badge.cls}">{badge.label}</span>
        {/if}
        <SelectAlertButton alert={a} />
      </div>
    </div>

    <!-- Trade section -->
    <div class="trade-section">
      <!-- Existing trade chips -->
      {#if trades.length > 0}
        <div class="trade-chips">
          {#each trades as t (t.id)}
            {@const p = pnl(t, a.status)}
            <div class="trade-chip">
              <span class="trade-chip__cote">@{Number(t.cote).toFixed(2)}</span>
              {#if t.mise}
                <span class="trade-chip__mise">{Number(t.mise).toFixed(2)}€</span>
                {#if p !== null}
                  <span
                    class="trade-chip__pnl"
                    class:trade-chip__pnl--pos={p >= 0}
                    class:trade-chip__pnl--neg={p < 0}
                  >{formatPnl(p)}</span>
                {:else}
                  <span class="trade-chip__pnl trade-chip__pnl--neutral">—</span>
                {/if}
              {/if}
              <button
                class="trade-chip__delete"
                onclick={() => removeTrade(t.id)}
                title="Supprimer ce trade"
                aria-label="Supprimer"
              >×</button>
            </div>
          {/each}
        </div>
      {/if}

      <!-- Inline add form -->
      <div class="trade-add-row">
        <input
          class="trade-input trade-input--cote"
          type="text"
          inputmode="decimal"
          placeholder="Cote*"
          bind:value={formCote[cardId]}
          oninput={() => { formError[cardId] = ''; }}
        />
        <input
          class="trade-input trade-input--mise"
          type="text"
          inputmode="decimal"
          placeholder="Mise (opt.)"
          bind:value={formMise[cardId]}
          oninput={() => { formError[cardId] = ''; }}
        />
        <button
          class="btn btn--sm btn--primary trade-add-btn"
          onclick={() => addTrade(a)}
          disabled={formBusy[cardId]}
        >
          {formBusy[cardId] ? '...' : 'Ajouter'}
        </button>
      </div>

      {#if formError[cardId]}
        <div class="trade-form-error">{formError[cardId]}</div>
      {/if}

      <!-- P&L total -->
      {#if total !== null}
        <div class="trade-total" class:trade-total--pos={total >= 0} class:trade-total--neg={total < 0}>
          P&amp;L total : {formatPnl(total)}
        </div>
      {/if}
    </div>
  </div>
{/snippet}

<style>
  .page-header {
    margin-bottom: 20px;
  }

  .error-msg {
    color: var(--color-danger);
    font-size: 13px;
    margin-bottom: 12px;
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

  /* ---- Sections ---- */
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

  /* Collapsible section header */
  .mes-section__collapsible {
    display: flex;
    align-items: center;
    gap: 8px;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    font-size: 13px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--color-text-secondary);
    width: 100%;
    text-align: left;
    transition: color var(--transition-fast);
  }
  .mes-section__collapsible:hover {
    color: var(--color-text-primary);
  }

  .mes-section__chevron {
    font-size: 16px;
    line-height: 1;
    transition: transform var(--transition-fast);
    display: inline-block;
    color: var(--color-text-muted);
  }
  .mes-section__chevron--open {
    transform: rotate(90deg);
  }

  .mes-section__title-text {
    flex: 1;
  }

  /* Section count badges */
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

  .mes-section__badge--fhg {
    background: rgba(29, 158, 117, 0.18);
    color: var(--color-accent-green);
  }

  .mes-section__badge--lg2 {
    background: rgba(127, 119, 221, 0.18);
    color: var(--color-badge-violet);
  }

  .mes-section__badge--terminated {
    background: rgba(160, 163, 177, 0.12);
    color: var(--color-text-muted);
  }

  /* Sub-section labels (Aujourd'hui / A venir) */
  .subsection-label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: var(--color-text-muted);
    margin-bottom: 6px;
  }
  .subsection-label--mt {
    margin-top: 14px;
  }

  .alerts-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  /* ---- Alert card ---- */
  .alert-card {
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: 10px;
    overflow: hidden;
    transition: border-color 0.2s;
  }
  .alert-card--validated {
    border-color: var(--color-accent-green) !important;
    background: rgba(29, 158, 117, 0.04);
  }
  .alert-card--lost {
    border-color: var(--color-danger) !important;
    background: rgba(226, 75, 74, 0.04);
  }
  .alert-card--live {
    border-color: var(--color-signal-moyen) !important;
    background: rgba(239, 159, 39, 0.04);
  }

  /* Header row */
  .alert-card__header {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 12px 16px;
  }
  .alert-card__header--static {
    cursor: default;
  }

  .alert-card__time {
    min-width: 65px;
    text-align: center;
    flex-shrink: 0;
  }
  .alert-card__day {
    font-size: 10px;
    color: var(--color-text-muted);
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

  .alert-card__badges {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
    align-items: center;
    flex-wrap: wrap;
  }

  /* Signal type badge */
  .signal-type-badge {
    background: rgba(55, 138, 221, 0.15);
    color: var(--color-accent-blue);
    font-size: 10px;
    font-weight: 700;
    padding: 3px 8px;
    border-radius: 4px;
    text-transform: uppercase;
  }

  /* ---- Trade section ---- */
  .trade-section {
    padding: 10px 16px 12px;
    border-top: 1px solid var(--color-border);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  /* Trade chips */
  .trade-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .trade-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--color-border);
    border-radius: 6px;
    padding: 4px 8px;
    font-size: 12px;
  }

  .trade-chip__cote {
    font-weight: 600;
    color: var(--color-text-primary);
  }

  .trade-chip__mise {
    color: var(--color-text-secondary);
  }

  .trade-chip__pnl {
    font-weight: 700;
  }
  .trade-chip__pnl--pos {
    color: var(--color-accent-green);
  }
  .trade-chip__pnl--neg {
    color: var(--color-danger);
  }
  .trade-chip__pnl--neutral {
    color: var(--color-text-muted);
  }

  .trade-chip__delete {
    background: none;
    border: none;
    color: var(--color-text-muted);
    cursor: pointer;
    font-size: 14px;
    line-height: 1;
    padding: 0 2px;
    margin-left: 2px;
    border-radius: 3px;
    transition: color var(--transition-fast), background var(--transition-fast);
  }
  .trade-chip__delete:hover {
    color: var(--color-danger);
    background: rgba(226, 75, 74, 0.12);
  }

  /* Inline add form */
  .trade-add-row {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .trade-input {
    background: var(--color-bg-input);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-input);
    padding: 5px 9px;
    color: var(--color-text-primary);
    font-size: 12px;
    transition: border-color var(--transition-fast);
  }
  .trade-input:focus {
    border-color: var(--color-accent-blue);
    outline: none;
  }
  .trade-input::placeholder {
    color: var(--color-text-muted);
  }
  .trade-input--cote {
    width: 90px;
  }
  .trade-input--mise {
    width: 110px;
  }

  .trade-add-btn {
    flex-shrink: 0;
  }

  .trade-form-error {
    font-size: 11px;
    color: var(--color-danger);
  }

  /* P&L total */
  .trade-total {
    font-size: 12px;
    font-weight: 700;
    padding-top: 2px;
  }
  .trade-total--pos {
    color: var(--color-accent-green);
  }
  .trade-total--neg {
    color: var(--color-danger);
  }

  /* ---- Responsive ---- */
  @media (max-width: 768px) {
    .alert-card__header {
      flex-wrap: wrap;
    }
    .alert-card__badges {
      flex-wrap: wrap;
      width: 100%;
    }
    .trade-add-row {
      gap: 4px;
    }
    .trade-input--cote {
      width: 75px;
    }
    .trade-input--mise {
      width: 95px;
    }
  }
</style>
