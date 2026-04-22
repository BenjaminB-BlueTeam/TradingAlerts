<script>
  import { onMount } from 'svelte';

  let { message = '', type = 'info', duration = 3200 } = $props();

  let visible = $state(true);

  onMount(() => {
    const timer = setTimeout(() => {
      visible = false;
    }, duration);
    return () => clearTimeout(timer);
  });
</script>

{#if visible}
  <div class="toast toast--{type}" role="alert">
    <span>{message}</span>
  </div>
{/if}
