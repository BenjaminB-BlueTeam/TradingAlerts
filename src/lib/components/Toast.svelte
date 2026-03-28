<script>
  import { onMount } from 'svelte';

  export let message = '';
  export let type = 'info'; // success | error | warning | info
  export let duration = 3200;

  let visible = true;

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
