import { POLL_LIMITS } from '@mellocracia/contracts';

function parseInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(maximum, Math.max(minimum, parsed));
}

function withoutTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

export class AppConfig {
  readonly nodeEnv = process.env.NODE_ENV ?? 'development';
  readonly port = parseInteger(process.env.PORT, 3000, 1, 65_535);
  readonly databaseUrl =
    process.env.DATABASE_URL ??
    'postgres://postgres:postgres@localhost:5432/mellocracia';
  readonly databasePoolMax = parseInteger(
    process.env.DATABASE_POOL_MAX,
    10,
    1,
    50,
  );
  readonly databaseConnectionTimeoutMs = parseInteger(
    process.env.DATABASE_CONNECTION_TIMEOUT_MS,
    5_000,
    500,
    30_000,
  );
  readonly databaseStatementTimeoutMs = parseInteger(
    process.env.DATABASE_STATEMENT_TIMEOUT_MS,
    10_000,
    1_000,
    60_000,
  );
  readonly redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';

  readonly webOrigin = withoutTrailingSlash(
    process.env.WEB_ORIGIN ?? 'http://localhost:4321',
  );
  readonly publicOrigin = withoutTrailingSlash(
    process.env.PUBLIC_ORIGIN ?? this.webOrigin,
  );
  readonly votePathPrefix = this.normalizePathPrefix(
    process.env.VOTE_PATH_PREFIX ?? '/p',
  );
  readonly resultsPathPrefix = this.normalizePathPrefix(
    process.env.RESULTS_PATH_PREFIX ?? '/r',
  );

  readonly ghostContentApiUrl = withoutTrailingSlash(
    process.env.GHOST_CONTENT_API_URL ??
      'https://mello.yudi.com.br/ghost/api/content',
  );
  readonly ghostContentApiKey = process.env.GHOST_CONTENT_API_KEY ?? '';
  readonly ghostApiVersion = process.env.GHOST_API_VERSION ?? 'v6.0';
  readonly ghostCacheTtlSeconds = parseInteger(
    process.env.GHOST_CACHE_TTL_SECONDS,
    300,
    30,
    3_600,
  );
  readonly ghostFetchTimeoutMs = parseInteger(
    process.env.GHOST_FETCH_TIMEOUT_MS,
    10_000,
    1_000,
    60_000,
  );
  readonly ghostFetchAttempts = parseInteger(
    process.env.GHOST_FETCH_ATTEMPTS,
    3,
    1,
    5,
  );
  readonly ghostMaxPosts = parseInteger(
    process.env.GHOST_MAX_POSTS,
    POLL_LIMITS.maxCatalogPosts,
    1,
    POLL_LIMITS.maxCatalogPosts,
  );

  readonly maxPollOptions = parseInteger(
    process.env.POLL_MAX_OPTIONS,
    POLL_LIMITS.maxOptions,
    POLL_LIMITS.minOptions,
    POLL_LIMITS.maxOptions,
  );
  readonly pollCleanupBatchSize = parseInteger(
    process.env.POLL_CLEANUP_BATCH_SIZE,
    100,
    1,
    1_000,
  );
  readonly maxVotesPerPoll = parseInteger(
    process.env.POLL_MAX_VOTES,
    100_000,
    100,
    1_000_000,
  );

  /**
   * Token and IP hashes are deliberately separate secrets. Both have safe
   * development fallbacks so a fresh checkout can boot, but production should
   * always provide long random values through the environment.
   */
  readonly tokenHashSecret = this.secret(
    'TOKEN_HASH_SECRET',
    'development-token-hash-secret-change-me',
  );
  readonly ipHashSecret = this.secret(
    'IP_HASH_SECRET',
    'development-ip-hash-secret-change-me',
  );

  readonly trustCloudflare = process.env.TRUST_CLOUDFLARE === 'true';
  readonly cookieName = process.env.VOTER_COOKIE_NAME ?? 'mellocracia_voter';
  readonly cookieSecure = process.env.COOKIE_SECURE
    ? process.env.COOKIE_SECURE === 'true'
    : this.nodeEnv === 'production';

  readonly createRateLimitTenMinutes = parseInteger(
    process.env.CREATE_RATE_LIMIT_10M,
    3,
    1,
    1_000,
  );
  readonly createRateLimitDay = parseInteger(
    process.env.CREATE_RATE_LIMIT_DAY,
    20,
    1,
    10_000,
  );
  readonly voteRateLimitPerMinute = parseInteger(
    process.env.VOTE_RATE_LIMIT_MINUTE,
    10,
    1,
    10_000,
  );
  readonly voteGlobalRateLimitPerMinute = parseInteger(
    process.env.VOTE_GLOBAL_RATE_LIMIT_MINUTE,
    this.voteRateLimitPerMinute * 6,
    this.voteRateLimitPerMinute,
    100_000,
  );
  readonly readRateLimitPerMinute = parseInteger(
    process.env.READ_RATE_LIMIT_MINUTE,
    120,
    1,
    100_000,
  );
  readonly catalogRateLimitPerMinute = parseInteger(
    process.env.CATALOG_RATE_LIMIT_MINUTE,
    30,
    1,
    100_000,
  );
  readonly resultsRateLimitPerMinute = parseInteger(
    process.env.RESULTS_RATE_LIMIT_MINUTE,
    30,
    1,
    100_000,
  );

  readonly turnstileSecretKey = process.env.TURNSTILE_SECRET_KEY ?? '';
  readonly turnstileSiteverifyUrl =
    process.env.TURNSTILE_SITEVERIFY_URL ??
    'https://challenges.cloudflare.com/turnstile/v0/siteverify';

  private normalizePathPrefix(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) {
      return '';
    }
    return `/${trimmed.replace(/^\/+|\/+$/g, '')}`;
  }

  private secret(name: string, developmentFallback: string): string {
    const value = process.env[name];
    if (!value && this.nodeEnv === 'production') {
      throw new Error(`${name} must be configured in production`);
    }
    return value ?? developmentFallback;
  }
}
