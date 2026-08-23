import { afterEach, describe, expect, test } from 'bun:test';
import { CatalogService } from '../src/app/catalog/catalog.service';
import { AppConfig } from '../src/app/config/app-config';
import { RedisService } from '../src/app/redis/redis.service';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function createService(): CatalogService {
  const config = {
    ghostContentApiKey: 'content-api-key',
    ghostContentApiUrl: 'https://ghost.example/ghost/api/content',
    ghostApiVersion: 'v6.0',
    ghostCacheTtlSeconds: 300,
    ghostFetchTimeoutMs: 1_000,
    ghostFetchAttempts: 2,
    ghostMaxPosts: 100,
  } as AppConfig;
  const redis = {
    get: async () => null,
    set: async () => undefined,
  } as RedisService;
  const service = new CatalogService(config, redis);

  return service;
}

describe('CatalogService', () => {
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
});
