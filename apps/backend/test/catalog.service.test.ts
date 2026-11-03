import { afterEach, describe, expect, test } from 'bun:test';
import { CatalogService } from '../src/app/catalog/catalog.service';
import { AppConfig } from '../src/app/config/app-config';
import { RedisService } from '../src/app/redis/redis.service';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function createService(
  ghostMaxPosts = 100,
  overrides: Partial<AppConfig> = {},
): CatalogService {
  const config = {
    ghostContentApiKey: 'content-api-key',
    ghostContentApiUrl: 'https://ghost.example/ghost/api/content',
    ghostPublicUrl: 'https://ghost.example',
    ghostApiVersion: 'v6.0',
    ghostCacheTtlSeconds: 300,
    ghostFetchTimeoutMs: 1_000,
    ghostFetchAttempts: 2,
    ghostMaxPosts,
    ...overrides,
  } as AppConfig;
  const redis = {
    get: async () => null,
    set: async () => undefined,
  } as RedisService;
  const service = new CatalogService(config, redis);

  return service;
}

describe('CatalogService', () => {
  test.each(['https://ghost.example', 'http://ghost.example:8080'])(
    'uses the internal endpoint with canonical headers for %s on every page and retry',
    async (ghostPublicUrl) => {
      const requests: { url: URL; headers: Headers }[] = [];
      globalThis.fetch = (async (input, init) => {
        const url = new URL(String(input));
        requests.push({ url, headers: new Headers(init?.headers) });
        if (requests.length === 1) {
          return new Response(null, { status: 503 });
        }
        const page = Number(url.searchParams.get('page'));
        return Response.json({
          posts: [{ id: `post-${page}`, title: `Post ${page}` }],
          meta: { pagination: { pages: 2, next: page === 1 ? 2 : null } },
        });
      }) as typeof globalThis.fetch;

      const catalog = await createService(200, {
        ghostContentApiUrl: 'http://ghost:2368/ghost/api/content',
        ghostPublicUrl,
      }).getCatalog();

      expect(catalog.items).toHaveLength(2);
      expect(requests).toHaveLength(3);
      expect(requests.map(({ url }) => url.searchParams.get('page'))).toEqual([
        '1',
        '1',
        '2',
      ]);
      const canonical = new URL(ghostPublicUrl);
      for (const { url, headers } of requests) {
        expect(url.origin).toBe('http://ghost:2368');
        expect(url.pathname).toBe('/ghost/api/content/posts/');
        expect(url.searchParams.get('key')).toBe('content-api-key');
        expect(headers.get('host')).toBe(canonical.host);
        expect(headers.get('x-forwarded-host')).toBe(canonical.host);
        expect(headers.get('x-forwarded-proto')).toBe(
          canonical.protocol.slice(0, -1),
        );
        expect(headers.get('accept')).toBe('application/json');
        expect(headers.get('accept-version')).toBe('v6.0');
      }
    },
  );

  test('increases the request timeout exponentially for each attempt', () => {
    const service = createService() as unknown as {
      ghostFetchTimeoutForAttempt(attempt: number): number;
    };

    expect([
      service.ghostFetchTimeoutForAttempt(1),
      service.ghostFetchTimeoutForAttempt(2),
      service.ghostFetchTimeoutForAttempt(3),
    ]).toEqual([1_000, 2_000, 4_000]);
  });

  test('retries an aborted Ghost request before returning the catalog', async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      if (calls === 1) {
        throw new DOMException('This operation was aborted', 'AbortError');
      }
      return Response.json({
        posts: [],
        meta: { pagination: { pages: 1, next: null } },
      });
    }) as typeof globalThis.fetch;

    await expect(createService().getCatalog()).resolves.toMatchObject({
      items: [],
      stale: false,
    });
    expect(calls).toBe(2);
  });

  test('retries transient Ghost HTTP failures', async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      if (calls === 1) {
        return new Response(null, { status: 503 });
      }
      return Response.json({
        posts: [],
        meta: { pagination: { pages: 1, next: null } },
      });
    }) as typeof globalThis.fetch;

    await expect(createService().getCatalog()).resolves.toMatchObject({
      items: [],
      stale: false,
    });
    expect(calls).toBe(2);
  });

  test('fetches public tags and keeps a catalog snapshot stable across a shifting page boundary', async () => {
    const requestedUrls: URL[] = [];
    globalThis.fetch = (async (input) => {
      const url = new URL(String(input));
      requestedUrls.push(url);
      const page = url.searchParams.get('page');
      return Response.json(
        page === '1'
          ? {
              posts: [
                { id: 'post-a', title: 'A', tags: [{ name: 'Estratégia' }] },
                {
                  id: 'post-b',
                  title: 'B',
                  tags: [{ name: '#interno', visibility: 'internal' }],
                },
              ],
              meta: { pagination: { pages: 2, next: 2 } },
            }
          : {
              // A post published during an offset-paginated fetch can make
              // the last item on the prior page reappear here.
              posts: [
                { id: 'post-b', title: 'B' },
                { id: 'post-c', title: 'C', tags: [{ name: 'Família' }] },
              ],
              meta: { pagination: { pages: 2, next: null } },
            },
      );
    }) as typeof globalThis.fetch;

    const catalog = await createService(200).getCatalog();

    expect(catalog.items.map((item) => item.id)).toEqual([
      'post-a',
      'post-b',
      'post-c',
    ]);
    expect(catalog.items[0].tags).toEqual(['Estratégia']);
    expect(catalog.items[1].tags).toEqual([]);
    expect(requestedUrls).toHaveLength(2);
    expect(requestedUrls[0].searchParams.get('include')).toBe('tags');
    expect(requestedUrls[0].searchParams.get('filter')).toMatch(
      /^published_at:<='/,
    );
  });
});
