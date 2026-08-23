<script lang="ts">
  export type IconName = 'arrow-right' | 'arrow-left' | 'calendar' | 'check' | 'clock' | 'copy' | 'external' | 'lock' | 'refresh' | 'search' | 'share' | 'x';

  export let name: IconName;
  export let size = 20;
  export let strokeWidth = 2;
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width={strokeWidth}
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
  focusable="false"
>
  {#if name === 'arrow-right'}
    <path d="M4 12h15" /><path d="m13 6 6 6-6 6" />
  {:else if name === 'arrow-left'}
    <path d="M20 12H5" /><path d="m11 18-6-6 6-6" />
  {:else if name === 'calendar'}
    <rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M7.5 3.5v3M16.5 3.5v3M3.5 9.5h17" />
  {:else if name === 'check'}
    <path d="m5 12.5 4.2 4.2L19.5 6.8" />
  {:else if name === 'clock'}
    <circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3.2 2" />
  {:else if name === 'copy'}
    <rect x="8" y="8" width="11" height="12" rx="1.5" /><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v10A1.5 1.5 0 0 0 5.5 17H8" />
  {:else if name === 'external'}
    <path d="M14 4h6v6M20 4l-9 9" /><path d="M18 13.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5.5" />
  {:else if name === 'lock'}
    <rect x="4.5" y="10" width="15" height="10" rx="2" /><path d="M8 10V7.5a4 4 0 0 1 8 0V10M12 14v2" />
  {:else if name === 'refresh'}
    <path d="M20 11a8 8 0 0 0-14.8-3L3 11" /><path d="M3 5v6h6M4 13a8 8 0 0 0 14.8 3L21 13" /><path d="M21 19v-6h-6" />
  {:else if name === 'search'}
    <circle cx="10.7" cy="10.7" r="6.8" /><path d="m16 16 4.5 4.5" />
  {:else if name === 'share'}
    <circle cx="18" cy="5.5" r="2.3" /><circle cx="6" cy="12" r="2.3" /><circle cx="18" cy="18.5" r="2.3" /><path d="m8 11 7.8-4.3M8 13l7.8 4.3" />
  {:else if name === 'x'}
    <path d="M6 6l12 12M18 6 6 18" />
  {/if}
</svg>
