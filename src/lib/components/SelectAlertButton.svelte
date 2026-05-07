<script>
  import { selectedKeys, select, unselect, isSelected } from '$lib/stores/selectionStore.js';

  let { alert } = $props();

  let isPending = $state(false);

  let selected = $derived(isSelected($selectedKeys, alert.match_id, alert.signal_type));

  let isExcluded = $derived(!!alert.user_excluded);
  // Clôturée ET non-sélectionnée : interdit la sélection rétroactive (anti-biais)
  // Si déjà sélectionnée et terminée : on autorise la désélection
  let isClosedNonSelected = $derived(
    !!alert.status && alert.status !== 'pending' && !selected
  );

  let disabled = $derived(isPending || isExcluded || isClosedNonSelected);

  let tooltip = $derived.by(() => {
    if (isExcluded) return "Alerte exclue — réintégrez-la pour pouvoir la sélectionner";
    if (isClosedNonSelected) return "Alerte clôturée — sélection rétroactive interdite (anti-biais)";
    if (selected) return "Cliquer pour désélectionner";
    return "Sélectionner cette alerte";
  });

  async function handleClick(e) {
    e.stopPropagation();
    if (disabled) return;
    isPending = true;
    try {
      if (selected) {
        await unselect(alert.match_id, alert.signal_type);
      } else {
        await select(alert.match_id, alert.signal_type);
      }
    } catch (err) {
      console.error('SelectAlertButton:', err);
    } finally {
      isPending = false;
    }
  }
</script>

<button
  class="btn btn--sm select-btn"
  class:select-btn--selected={selected}
  class:select-btn--disabled={disabled}
  {disabled}
  onclick={handleClick}
  title={tooltip}
  aria-pressed={selected}
>
  {#if isPending}
    ⏳
  {:else if selected}
    ✓ Sélectionnée
  {:else}
    Sélectionner
  {/if}
</button>

<style>
  .select-btn {
    border: 1px solid var(--color-accent-green);
    color: var(--color-accent-green);
    background: rgba(29, 158, 117, 0.08);
    transition: background var(--transition-fast), opacity var(--transition-fast);
    white-space: nowrap;
  }
  .select-btn:hover:not(.select-btn--disabled) {
    background: rgba(29, 158, 117, 0.18);
  }
  .select-btn--selected {
    background: var(--color-accent-green);
    color: var(--color-text-primary);
    border-color: var(--color-accent-green);
  }
  .select-btn--selected:hover:not(.select-btn--disabled) {
    background: rgba(29, 158, 117, 0.80);
  }
  .select-btn--disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
