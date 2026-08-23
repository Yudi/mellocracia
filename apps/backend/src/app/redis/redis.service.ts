import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { createClient, RedisClientType } from 'redis';
import { AppConfig } from '../config/app-config';

export interface RateLimitWindow {
  key: string;
  limit: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

const RATE_LIMIT_SCRIPT = `
  local minimum_ttl = 0
  for index, key in ipairs(KEYS) do
    local current = tonumber(redis.call('GET', key) or '0')
    local limit = tonumber(ARGV[(index - 1) * 2 + 1])
    if current >= limit then
      local ttl = redis.call('TTL', key)
      if ttl > minimum_ttl then minimum_ttl = ttl end
      return {0, minimum_ttl}
    end
  end

  for index, key in ipairs(KEYS) do
    local current = redis.call('INCR', key)
    if current == 1 then
      redis.call('EXPIRE', key, tonumber(ARGV[(index - 1) * 2 + 2]))
    end
    local ttl = redis.call('TTL', key)
    if ttl > minimum_ttl then minimum_ttl = ttl end
  end

  return {1, minimum_ttl}
`;

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: RedisClientType;
  private connectionError?: Error;

  constructor(private readonly config: AppConfig) {
    this.client = createClient({ url: this.config.redisUrl });
    this.client.on('error', (error) => {
      this.connectionError =
        error instanceof Error ? error : new Error(String(error));
      this.logger.error(`Redis error: ${this.connectionError.message}`);
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.client.connect();
      this.connectionError = undefined;
    } catch (error) {
      this.connectionError =
        error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Redis connection failed: ${this.connectionError.message}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client.isOpen) {
      await this.client.quit().catch(() => undefined);
    }
  }

  get isReady(): boolean {
    return this.client.isReady;
  }

  private requireReady(): RedisClientType {
    if (!this.client.isReady) {
      throw this.connectionError ?? new Error('Redis is unavailable');
    }
    return this.client;
  }

  async ping(): Promise<void> {
    await this.requireReady().ping();
  }

  async get(key: string): Promise<string | null> {
    return (await this.requireReady().get(key)) as string | null;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.requireReady().set(key, value, { EX: ttlSeconds });
  }

  async consumeRateLimits(
    windows: readonly RateLimitWindow[],
  ): Promise<RateLimitResult> {
    if (windows.length === 0) {
      return { allowed: true, retryAfterSeconds: 0 };
    }

    const client = this.requireReady();
    const keys = windows.map((window) => window.key);
    const args = windows.flatMap((window) => [
      String(window.limit),
      String(window.windowSeconds),
    ]);
    const rawResult = (await client.eval(RATE_LIMIT_SCRIPT, {
      keys,
      arguments: args,
    })) as unknown;
    const result = Array.isArray(rawResult) ? rawResult : [];
    const allowed = Number(result[0]) === 1;
    const retryAfterSeconds = Math.max(
      1,
      Number(result[1]) || windows[0].windowSeconds,
    );
    return { allowed, retryAfterSeconds };
  }
}
