<script>
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  onMount(() => goto('/mes-matchs', { replaceState: true }));
</script>
