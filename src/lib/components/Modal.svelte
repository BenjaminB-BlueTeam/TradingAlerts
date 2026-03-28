<script>
  export let title = '';
  export let open = false;
  export let onClose = () => {};

  function handleKeydown(e) {
    if (e.key === 'Escape') onClose();
  }

  function handleOverlayClick(e) {
    if (e.target === e.currentTarget) onClose();
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if open}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <div class="modal-overlay" on:click={handleOverlayClick} role="dialog" aria-modal="true">
    <div class="modal">
      <div class="modal__header">
        <span class="modal__title">{title}</span>
        <button class="modal__close" on:click={onClose} aria-label="Fermer">✕</button>
      </div>
      <div class="modal__body">
        <slot />
      </div>
    </div>
  </div>
{/if}
