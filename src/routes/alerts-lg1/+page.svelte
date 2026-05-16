<script>
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  onMount(() => goto('/alerts/lg1', { replaceState: true }));
</script>
