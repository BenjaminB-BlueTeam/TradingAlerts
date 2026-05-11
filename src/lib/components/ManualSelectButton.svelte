<script>
  import { selectedKeys, select, unselect, isSelected } from '$lib/stores/selectionStore.js';
  import { createManualAlert } from '$lib/api/supabase.js';

  let { match, leagueName } = $props();

  let loadingLG1 = $state(false);
  let loadingLG2 = $state(false);
  let errorMsg = $state('');

  let selectedLG1 = $derived(isSelected($selectedKeys, match.id, 'LG1_MANUAL'));
  let selectedLG2 = $derived(isSelected($selectedKeys, match.id, 'LG2_MANUAL'));

  async function handleLG1(e) {
    e.stopPropagation();
    if (loadingLG1) return;
    errorMsg = '';
    loadingLG1 = true;
    try {
      if (selectedLG1) {
        await unselect(match.id, 'LG1_MANUAL');
      } else {
        await createManualAlert(match, 'LG1', leagueName);
        await select(match.id, 'LG1_MANUAL');
      }
    } catch (err) {
      console.error('ManualSelectButton LG1:', err);
      errorMsg = 'Erreur LG1';
    } finally {
      loadingLG1 = false;
    }
  }

  async function handleLG2(e) {
    e.stopPropagation();
    if (loadingLG2) return;
    errorMsg = '';
    loadingLG2 = true;
    try {
      if (selectedLG2) {
        await unselect(match.id, 'LG2_MANUAL');
      } else {
        await createManualAlert(match, 'LG2', leagueName);
        await select(match.id, 'LG2_MANUAL');
      }
    } catch (err) {
      console.error('ManualSelectButton LG2:', err);
      errorMsg = 'Erreur LG2';
    } finally {
      loadingLG2 = false;
    }
  }
</script>

<div class="manual-select" onclick={(e) => e.stopPropagation()} role="none">
  <button
    class="msb"
    class:msb--selected={selectedLG1}
    class:msb--loading={loadingLG1}
    onclick={handleLG1}
    title={selectedLG1 ? 'Retirer LG1' : 'Ajouter LG1 à mes matchs'}
    aria-pressed={selectedLG1}
    disabled={loadingLG1}
  >
    {#if loadingLG1}
      ...
    {:else if selectedLG1}
      LG1
    {:else}
      +LG1
    {/if}
  </button>

  <button
    class="msb"
    class:msb--selected={selectedLG2}
    class:msb--loading={loadingLG2}
    onclick={handleLG2}
    title={selectedLG2 ? 'Retirer LG2' : 'Ajouter LG2 à mes matchs'}
    aria-pressed={selectedLG2}
    disabled={loadingLG2}
  >
    {#if loadingLG2}
      ...
    {:else if selectedLG2}
      LG2
    {:else}
      +LG2
    {/if}
  </button>

  {#if errorMsg}
    <span class="msb-error">{errorMsg}</span>
  {/if}
</div>

<style>
  .manual-select {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  .msb {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 3px 7px;
    border-radius: var(--radius-sm, 4px);
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    border: 1px solid var(--color-accent-green);
    color: var(--color-accent-green);
    background: transparent;
    transition: background var(--transition-fast), color var(--transition-fast), opacity var(--transition-fast);
    line-height: 1.4;
    min-width: 34px;
  }

  .msb:hover:not(:disabled) {
    background: rgba(29, 158, 117, 0.15);
  }

  .msb--selected {
    background: var(--color-accent-green);
    color: var(--color-text-primary);
  }

  .msb--selected:hover:not(:disabled) {
    background: rgba(29, 158, 117, 0.80);
    color: var(--color-text-primary);
  }

  .msb--loading,
  .msb:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .msb-error {
    font-size: 10px;
    color: var(--color-warning-orange, #f59e0b);
  }
</style>
