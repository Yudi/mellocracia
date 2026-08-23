import { defineMiddleware } from 'astro:middleware';

const CSP_PARTS = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data: https://mello.yudi.com.br https://static.ghost.org",
  "script-src 'self' https://challenges.cloudflare.com",
  'frame-src https://challenges.cloudflare.com',
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "manifest-src 'self'",
].join('; ');

export const onRequest = defineMiddleware(async (context, next) => {
  const response = await next();
  const localConnectSources = ['localhost', '127.0.0.1'].includes(
    context.url.hostname,
  )
    ? ' http://localhost:* http://127.0.0.1:*'
    : '';
  const cspParts = [
    ...CSP_PARTS,
    `connect-src 'self' https://challenges.cloudflare.com${localConnectSources}`,
  ];
  if (context.url.protocol === 'https:') {
    cspParts.push('upgrade-insecure-requests');
  }
  const csp = cspParts.join('; ');

  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  response.headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  response.headers.set('Origin-Agent-Cluster', '?1');
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()',
  );
  response.headers.set('Referrer-Policy', 'no-referrer');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-DNS-Prefetch-Control', 'off');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Permitted-Cross-Domain-Policies', 'none');
  response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');

  if (context.url.protocol === 'https:') {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload',
    );
  }

  return response;
});
