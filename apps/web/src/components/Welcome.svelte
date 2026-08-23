<script lang="ts">
  let clicks = 0;
</script>

<button type="button" onclick={() => (clicks += 1)}>
  {clicks === 0 ? 'Start playing' : `Played ${clicks} time${clicks === 1 ? '' : 's'}`}
</button>

<style>
  button {
    border: 0;
    border-radius: 0.5rem;
    background: #5b21b6;
    color: white;
    cursor: pointer;
    font: inherit;
    padding: 0.75rem 1rem;
  }
</style>
