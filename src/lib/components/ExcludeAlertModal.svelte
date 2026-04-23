<script>
  import { createEventDispatcher } from 'svelte';

  let { alert, open = $bindable(false) } = $props();

  const dispatch = createEventDispatcher();

  const TAGS = [
    { id: 'streak_trop_court',    label: 'Streak trop court' },
    { id: 'confirmation_limite',  label: 'Confirmation limite' },
    { id: 'ligue_inhabituelle',   label: 'Ligue inhabituelle' },
    { id: 'match_enjeu_fort',     label: 'Match à enjeu fort' },
    { id: 'h2h_suspect',          label: 'H2H suspect' },
    { id: 'forme_globale_faible', label: 'Forme globale faible' },
    { id: 'autre',                label: 'Autre' },
  ];

  let selectedTags = $state([]);
  let note = $state('');
  let submitting = $state(false);

  function toggleTag(id) {
    if (selectedTags.includes(id)) {
      selectedTags = selectedTags.filter(t => t !== id);
    } else {
      selectedTags = [...selectedTags, id];
    }
  }

  async function handleSubmit() {
    submitting = true;
    dispatch('excluded', { tags: selectedTags, note: note.trim() || null });
    open = false;
    selectedTags = [];
    note = '';
    submitting = false;
  }

  function handleClose() {
    open = false;
    selectedTags = [];
    note = '';
  }
</script>

{#if open}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="modal-overlay" onclick={handleClose}>
    <div class="modal-box" onclick={e => e.stopPropagation()}>
      <div class="modal-header">
        <span class="modal-title">Exclure l'alerte</span>
        <button class="modal-close" onclick={handleClose}>✕</button>
      </div>

      {#if alert}
        <p class="modal-match">
          {alert.home_team_name} - {alert.away_team_name}
          <span class="modal-badge">{alert.signal_type || 'FHG'}</span>
        </p>
      {/if}

      <div class="modal-section">
        <div class="modal-label">Raison(s) de l'exclusion</div>
        <div class="tag-grid">
          {#each TAGS as tag}
            <button
              class="tag-btn"
              class:tag-btn--selected={selectedTags.includes(tag.id)}
              onclick={() => toggleTag(tag.id)}
            >
              {tag.label}
            </button>
          {/each}
        </div>
      </div>

      <div class="modal-section">
        <div class="modal-label">Note libre (optionnel)</div>
        <textarea
          class="modal-textarea"
          placeholder="Ex: L'équipe n'a pas joué depuis 2 semaines..."
          bind:value={note}
          rows="3"
        ></textarea>
      </div>

      <div class="modal-footer">
        <button class="btn btn--ghost btn--sm" onclick={handleClose}>Annuler</button>
        <button
          class="btn btn--danger btn--sm"
          onclick={handleSubmit}
          disabled={submitting}
        >
          {submitting ? 'Exclusion...' : 'Confirmer exclusion'}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal-box {
    background: var(--color-bg-secondary, #1e1e2e);
    border: 1px solid var(--color-border, #2a2a3e);
    border-radius: 12px;
    padding: 20px;
    width: 420px;
    max-width: calc(100vw - 32px);
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .modal-title {
    font-size: 15px;
    font-weight: 700;
    color: var(--color-text-primary, #e0e0f0);
  }

  .modal-close {
    background: none;
    border: none;
    color: var(--color-text-muted, #888);
    cursor: pointer;
    font-size: 16px;
    padding: 4px;
  }

  .modal-match {
    font-size: 13px;
    color: var(--color-text-secondary, #b0b0c0);
    margin: 0;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .modal-badge {
    background: var(--color-accent-blue, #3d8ef7);
    color: #fff;
    border-radius: 4px;
    padding: 2px 6px;
    font-size: 11px;
    font-weight: 600;
  }

  .modal-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .modal-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--color-text-muted, #888);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .tag-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .tag-btn {
    padding: 6px 12px;
    border-radius: 20px;
    border: 1px solid var(--color-border, #2a2a3e);
    background: transparent;
    color: var(--color-text-secondary, #b0b0c0);
    font-size: 12px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .tag-btn:hover {
    border-color: var(--color-accent-blue, #3d8ef7);
    color: var(--color-accent-blue, #3d8ef7);
  }

  .tag-btn--selected {
    background: var(--color-accent-blue, #3d8ef7);
    border-color: var(--color-accent-blue, #3d8ef7);
    color: #fff;
  }

  .modal-textarea {
    width: 100%;
    background: var(--color-bg-primary, #12121c);
    border: 1px solid var(--color-border, #2a2a3e);
    border-radius: 8px;
    color: var(--color-text-primary, #e0e0f0);
    font-size: 13px;
    padding: 10px 12px;
    resize: vertical;
    box-sizing: border-box;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .btn--danger {
    background: #e53e3e;
    color: #fff;
    border: none;
  }

  .btn--danger:hover:not(:disabled) {
    background: #c53030;
  }

  .btn--danger:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
