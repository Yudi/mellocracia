import { Injectable, Logger } from '@nestjs/common';
import { CatalogItem, CatalogResponse } from '@mellocracia/contracts';
import { AppConfig } from '../config/app-config';
import { RedisService } from '../redis/redis.service';

interface GhostPost {
  id?: unknown;
  slug?: unknown;
  title?: unknown;
  excerpt?: unknown;
  feature_image?: unknown;
  feature_image_alt?: unknown;
  published_at?: unknown;
  url?: unknown;
}

interface GhostResponse {
  posts?: unknown;
  meta?: {
    pagination?: {
      next?: unknown;
      pages?: unknown;
    };
  };
}

interface CachedCatalog {
  items: CatalogItem[];
  fetchedAt: string;
}

const CATALOG_CURRENT_KEY = 'mellocracia:catalog:current:v1';
const CATALOG_STALE_KEY = 'mellocracia:catalog:stale:v1';
const CATALOG_STALE_TTL_SECONDS = 24 * 60 * 60;
const GHOST_PAGE_SIZE = 100;

@Injectable()
export class CatalogService {
  private readonly logger = new Logger(CatalogService.name);
  private localCache?: { value: CatalogResponse; expiresAt: number };
  private localStale?: CatalogResponse;
  private inFlight?: Promise<CatalogResponse>;

  constructor(
    private readonly config: AppConfig,
    private readonly redis: RedisService,
  ) {}

  async getCatalog(): Promise<CatalogResponse> {
    const now = Date.now();
    if (this.localCache && this.localCache.expiresAt > now) {
      return this.localCache.value;
    }

    if (this.inFlight) {
      return this.inFlight;
    }

    this.inFlight = this.loadCatalog();
    try {
      return await this.inFlight;
    } finally {
      this.inFlight = undefined;
    }
  }

  async getFreshOrStaleCatalog(): Promise<CatalogResponse> {
    return this.getCatalog();
  }

  private async loadCatalog(): Promise<CatalogResponse> {
    const cached = await this.readRedisCache(CATALOG_CURRENT_KEY);
    if (cached) {
      const response = { ...cached, stale: false } satisfies CatalogResponse;
      this.localCache = {
        value: response,
        expiresAt: Date.now() + this.config.ghostCacheTtlSeconds * 1_000,
      };
      this.localStale = response;
      return response;
    }

    try {
      const fetched = await this.fetchGhostCatalog();
      const response: CatalogResponse = {
        items: fetched.items,
        fetchedAt: fetched.fetchedAt,
        stale: false,
      };
      await this.writeRedisCache(fetched);
      this.localCache = {
        value: response,
        expiresAt: Date.now() + this.config.ghostCacheTtlSeconds * 1_000,
      };
      this.localStale = response;
      return response;
    } catch (error) {
      this.logger.warn(
        `Ghost catalog request failed: ${this.errorMessage(error)}`,
      );
      const stale =
        (await this.readRedisCache(CATALOG_STALE_KEY)) ?? this.localStale;
      if (stale) {
        return { ...stale, stale: true };
      }
      throw error;
    }
  }

  private async fetchGhostCatalog(): Promise<CachedCatalog> {
    if (!this.config.ghostContentApiKey) {
      throw new Error('GHOST_CONTENT_API_KEY is not configured');
    }

    const items: CatalogItem[] = [];
    const maxPages = Math.ceil(this.config.ghostMaxPosts / GHOST_PAGE_SIZE);
    const fields =
      'id,slug,title,excerpt,feature_image,feature_image_alt,published_at,url';

    for (
      let page = 1;
      page <= maxPages && items.length < this.config.ghostMaxPosts;
      page += 1
    ) {
      const url = this.buildGhostPostsUrl(page, fields);
      const response = await this.fetchWithTimeout(url);
      if (!response.ok) {
        throw new Error(`Ghost API returned HTTP ${response.status}`);
      }

      const payload = (await response.json()) as GhostResponse;
      const posts = Array.isArray(payload.posts) ? payload.posts : [];
      const normalized = posts
        .map((post) => this.normalizePost(post))
        .filter((post): post is CatalogItem => post !== undefined);
      items.push(
        ...normalized.slice(0, this.config.ghostMaxPosts - items.length),
      );

      const pagination = payload.meta?.pagination;
      const totalPages = Number(pagination?.pages);
      const hasNext = Number.isFinite(totalPages)
        ? page < totalPages
        : pagination?.next !== null && pagination?.next !== undefined;
      if (
        posts.length === 0 ||
        !hasNext ||
        (Number.isFinite(totalPages) && page >= totalPages)
      ) {
        break;
      }
    }

    return { items, fetchedAt: new Date().toISOString() };
  }

  private buildGhostPostsUrl(page: number, fields: string): string {
    const base = this.config.ghostContentApiUrl.endsWith('/posts')
      ? this.config.ghostContentApiUrl
      : `${this.config.ghostContentApiUrl}/posts`;
    const url = new URL(`${base}/`);
    url.searchParams.set('key', this.config.ghostContentApiKey);
    url.searchParams.set('limit', String(GHOST_PAGE_SIZE));
    url.searchParams.set('page', String(page));
    url.searchParams.set('fields', fields);
    url.searchParams.set('order', 'published_at desc');
    return url.toString();
  }

  private async fetchWithTimeout(url: string): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.ghostFetchTimeoutMs,
    );
    try {
      return await fetch(url, {
        signal: controller.signal,
        headers: {
          accept: 'application/json',
          'accept-version': this.config.ghostApiVersion,
        },
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private normalizePost(value: unknown): CatalogItem | undefined {
    if (!value || typeof value !== 'object') {
      return undefined;
    }
    const post = value as GhostPost;
    if (
      typeof post.id !== 'string' ||
      !post.id ||
      typeof post.title !== 'string' ||
      !post.title
    ) {
      return undefined;
    }
    return {
      id: post.id,
      slug: this.stringValue(post.slug),
      title: post.title,
      excerpt: this.stringValue(post.excerpt),
      featureImage: this.stringOrNull(post.feature_image),
      featureImageAlt: this.stringOrNull(post.feature_image_alt),
      publishedAt: this.stringValue(post.published_at),
      url: this.stringValue(post.url),
    };
  }

  private stringValue(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }

  private stringOrNull(value: unknown): string | null {
    return typeof value === 'string' && value.length > 0 ? value : null;
  }

  private async readRedisCache(
    key: string,
  ): Promise<CachedCatalog | undefined> {
    try {
      const raw = await this.redis.get(key);
      if (!raw) {
        return undefined;
      }
      const parsed = JSON.parse(raw) as CachedCatalog;
      if (
        !Array.isArray(parsed.items) ||
        typeof parsed.fetchedAt !== 'string'
      ) {
        return undefined;
      }
      if (!parsed.items.every((item) => this.isCatalogItem(item))) {
        return undefined;
      }
      return parsed;
    } catch (error) {
      this.logger.warn(
        `Redis catalog read failed: ${this.errorMessage(error)}`,
      );
      return undefined;
    }
  }

  private async writeRedisCache(value: CachedCatalog): Promise<void> {
    const serialized = JSON.stringify(value);
    try {
      await this.redis.set(
        CATALOG_CURRENT_KEY,
        serialized,
        this.config.ghostCacheTtlSeconds,
      );
      await this.redis.set(
        CATALOG_STALE_KEY,
        serialized,
        CATALOG_STALE_TTL_SECONDS,
      );
    } catch (error) {
      // A Ghost result is still useful for this request. Subsequent requests
      // will retry Redis, while localCache prevents an immediate stampede.
      this.logger.warn(
        `Redis catalog write failed: ${this.errorMessage(error)}`,
      );
    }
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private isCatalogItem(value: unknown): value is CatalogItem {
    if (!value || typeof value !== 'object') {
      return false;
    }
    const item = value as Partial<CatalogItem>;
    return (
      typeof item.id === 'string' &&
      item.id.length > 0 &&
      typeof item.slug === 'string' &&
      typeof item.title === 'string' &&
      item.title.length > 0 &&
      typeof item.excerpt === 'string' &&
      (item.featureImage === null || typeof item.featureImage === 'string') &&
      (item.featureImageAlt === null ||
        typeof item.featureImageAlt === 'string') &&
      typeof item.publishedAt === 'string' &&
      typeof item.url === 'string'
    );
  }
}
