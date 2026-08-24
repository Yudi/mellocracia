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
  tags?: unknown;
}

interface GhostTag {
  name?: unknown;
  visibility?: unknown;
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

const CATALOG_CURRENT_KEY = 'mellocracia:catalog:current:v2';
const CATALOG_STALE_KEY = 'mellocracia:catalog:stale:v2';
const CATALOG_STALE_TTL_SECONDS = 24 * 60 * 60;
const GHOST_PAGE_SIZE = 100;
const GHOST_FETCH_MAX_TIMEOUT_MS = 60_000;

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
    const seenPostIds = new Set<string>();
    const maxPages = Math.ceil(this.config.ghostMaxPosts / GHOST_PAGE_SIZE);
    const fields =
      'id,slug,title,excerpt,feature_image,feature_image_alt,published_at,url';
    // Page-based Ghost pagination can shift while this loop is running if a
    // post is published. The upper bound freezes this catalog snapshot, while
    // the ID set protects against any overlap at page boundaries.
    const publishedBefore = new Date().toISOString();

    for (
      let page = 1;
      page <= maxPages && items.length < this.config.ghostMaxPosts;
      page += 1
    ) {
      const url = this.buildGhostPostsUrl(page, fields, publishedBefore);
      const response = await this.fetchWithRetry(url);
      if (!response.ok) {
        throw new Error(`Ghost API returned HTTP ${response.status}`);
      }

      const payload = (await response.json()) as GhostResponse;
      const posts = Array.isArray(payload.posts) ? payload.posts : [];
      for (const post of posts) {
        const normalized = this.normalizePost(post);
        if (!normalized || seenPostIds.has(normalized.id)) {
          continue;
        }
        seenPostIds.add(normalized.id);
        items.push(normalized);
        if (items.length >= this.config.ghostMaxPosts) {
          break;
        }
      }

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

  private buildGhostPostsUrl(
    page: number,
    fields: string,
    publishedBefore: string,
  ): string {
    const base = this.config.ghostContentApiUrl.endsWith('/posts')
      ? this.config.ghostContentApiUrl
      : `${this.config.ghostContentApiUrl}/posts`;
    const url = new URL(`${base}/`);
    url.searchParams.set('key', this.config.ghostContentApiKey);
    url.searchParams.set('limit', String(GHOST_PAGE_SIZE));
    url.searchParams.set('page', String(page));
    url.searchParams.set('fields', fields);
    url.searchParams.set('include', 'tags');
    url.searchParams.set('filter', `published_at:<='${publishedBefore}'`);
    url.searchParams.set('order', 'published_at desc');
    return url.toString();
  }

  private async fetchWithRetry(url: string): Promise<Response> {
    let lastError: unknown;

    for (
      let attempt = 1;
      attempt <= this.config.ghostFetchAttempts;
      attempt += 1
    ) {
      try {
        const response = await this.fetchWithTimeout(
          url,
          this.ghostFetchTimeoutForAttempt(attempt),
        );
        if (
          response.ok ||
          !this.isRetryableGhostStatus(response.status) ||
          attempt === this.config.ghostFetchAttempts
        ) {
          return response;
        }

        this.logger.warn(
          `Ghost catalog request returned HTTP ${response.status}; retrying ` +
            `(${attempt}/${this.config.ghostFetchAttempts})`,
        );
      } catch (error) {
        lastError = error;
        if (attempt === this.config.ghostFetchAttempts) {
          throw error;
        }

        this.logger.warn(
          `Ghost catalog request failed: ${this.errorMessage(error)}; retrying ` +
            `(${attempt}/${this.config.ghostFetchAttempts})`,
        );
      }
    }

    throw lastError ?? new Error('Ghost catalog request failed');
  }

  private async fetchWithTimeout(
    url: string,
    timeoutMs: number,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
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

  private isRetryableGhostStatus(status: number): boolean {
    return status === 408 || status === 425 || status === 429 || status >= 500;
  }

  private ghostFetchTimeoutForAttempt(attempt: number): number {
    return Math.min(
      this.config.ghostFetchTimeoutMs * 2 ** (attempt - 1),
      GHOST_FETCH_MAX_TIMEOUT_MS,
    );
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
      tags: this.normalizeTags(post.tags),
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

  private normalizeTags(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    const names = value.flatMap((tag) => {
      if (!tag || typeof tag !== 'object') {
        return [];
      }
      const { name, visibility } = tag as GhostTag;
      if (visibility === 'internal' || typeof name !== 'string') {
        return [];
      }
      const normalized = name.trim();
      return normalized ? [normalized] : [];
    });
    return [...new Set(names)];
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
      Array.isArray(item.tags) &&
      item.tags.every((tag) => typeof tag === 'string') &&
      (item.featureImage === null || typeof item.featureImage === 'string') &&
      (item.featureImageAlt === null ||
        typeof item.featureImageAlt === 'string') &&
      typeof item.publishedAt === 'string' &&
      typeof item.url === 'string'
    );
  }
}
