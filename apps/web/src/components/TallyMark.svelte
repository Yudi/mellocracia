<script lang="ts">
  export let size = 30;
</script>

<svg
  class="tally-mark"
  width={size}
  height={Math.round(size * 0.72)}
  viewBox="0 0 40 29"
  fill="none"
  stroke="currentColor"
  stroke-width="3.4"
  stroke-linecap="round"
  aria-hidden="true"
  focusable="false"
>
  <path d="M7 4v19M15 3v20M23 3v20M31 4v19M3 21 35 7" />
</svg>

<style>
  .tally-mark {
    display: block;
    color: var(--signal);
  }
</style>
