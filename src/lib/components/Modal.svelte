<script>
  let { title = '', open = false, onClose = () => {}, children } = $props();

  function handleKeydown(e) {
    if (e.key === 'Escape') onClose();
  }

  function handleOverlayClick(e) {
    if (e.target === e.currentTarget) onClose();
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if open}
  <div class="modal-overlay" on:click={handleOverlayClick} on:keydown={handleKeydown} role="dialog" aria-modal="true">
    <div class="modal">
      <div class="modal__header">
        <span class="modal__title">{title}</span>
        <button class="modal__close" on:click={onClose} aria-label="Fermer">✕</button>
      </div>
      <div class="modal__body">
        {@render children()}
      </div>
    </div>
  </div>
{/if}
