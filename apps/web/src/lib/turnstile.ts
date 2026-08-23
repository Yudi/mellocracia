export interface TurnstileInstance {
  render(
    element: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      'expired-callback': () => void;
      'error-callback': () => void;
    },
  ): string;
  reset(widgetId?: string): void;
  remove(widgetId?: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileInstance;
  }
}

let scriptPromise: Promise<TurnstileInstance | null> | undefined;

export function getTurnstileSiteKey(): string | undefined {
  const key = import.meta.env.PUBLIC_TURNSTILE_SITE_KEY;
  return key || undefined;
}

export function loadTurnstile(): Promise<TurnstileInstance | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-turnstile]',
    );
    if (existing) {
      existing.addEventListener(
        'load',
        () => resolve(window.turnstile ?? null),
        { once: true },
      );
      existing.addEventListener('error', () => resolve(null), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src =
      'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.dataset.turnstile = 'true';
    script.addEventListener('load', () => resolve(window.turnstile ?? null), {
      once: true,
    });
    script.addEventListener('error', () => resolve(null), { once: true });
    document.head.appendChild(script);
  });

  return scriptPromise;
}
