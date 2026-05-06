<script>
  let { scope = $bindable('global') } = $props();

  const OPTIONS = [
    { key: 'global', label: 'Global' },
    { key: 'mine',   label: 'Mes sélections' },
  ];
</script>

<div class="scope-toggle" role="group" aria-label="Filtre scope">
  {#each OPTIONS as o}
    <button
      type="button"
      class="scope-btn"
      class:active={scope === o.key}
      onclick={() => scope = o.key}
      aria-pressed={scope === o.key}
    >
      {o.label}
    </button>
  {/each}
</div>

<style>
  .scope-toggle {
    display: inline-flex;
    background: rgba(255,255,255,0.04);
    border: 1px solid var(--color-border);
    border-radius: 6px;
    padding: 2px;
    gap: 2px;
  }
  .scope-btn {
    background: transparent;
    border: none;
    border-radius: 5px;
    padding: 4px 10px;
    font-size: 11px;
    color: var(--color-text-muted);
    cursor: pointer;
    transition: all 0.15s;
    font-weight: 500;
  }
  .scope-btn:hover {
    color: var(--color-text-primary);
  }
  .scope-btn.active {
    background: var(--color-accent-blue);
    color: #fff;
  }
</style>
