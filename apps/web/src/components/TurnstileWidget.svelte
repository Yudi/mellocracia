<script lang="ts">
  import { onMount } from 'svelte';
  import { loadTurnstile, type TurnstileInstance } from '../lib/turnstile';

  export let onToken: (token: string | undefined) => void = () => undefined;
  export let resetKey = 0;
  export let siteKey: string | undefined;

  let host: HTMLDivElement;
  let turnstile: TurnstileInstance | null = null;
  let widgetId: string | undefined;

  onMount(() => {
    if (!siteKey) return undefined;

    let cancelled = false;
    void loadTurnstile().then((instance) => {
      if (cancelled || !instance || !host || !siteKey) return;
      turnstile = instance;
      widgetId = instance.render(host, {
        sitekey: siteKey,
        callback: (token) => onToken(token),
        'expired-callback': () => onToken(undefined),
        'error-callback': () => onToken(undefined),
      });
    });

    return () => {
      cancelled = true;
      if (widgetId) turnstile?.remove(widgetId);
    };
  });

  $: if (resetKey > 0 && widgetId) {
    turnstile?.reset(widgetId);
    onToken(undefined);
  }
</script>

{#if siteKey}
  <div class="turnstile" bind:this={host} aria-label="Verificação de segurança"></div>
{/if}
