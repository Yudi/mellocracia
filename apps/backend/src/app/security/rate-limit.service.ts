import { Injectable } from '@nestjs/common';
import { AppConfig } from '../config/app-config';
import { RedisService, RateLimitWindow } from '../redis/redis.service';
import { RateLimitExceededException } from './rate-limit.exception';

@Injectable()
export class RateLimitService {
  constructor(
    private readonly redis: RedisService,
    private readonly config: AppConfig,
  ) {}

  async enforceCreate(ipHash: string): Promise<void> {
    const result = await this.consumeOrFail([
      {
        key: `mellocracia:rl:create:10m:${ipHash}`,
        limit: this.config.createRateLimitTenMinutes,
        windowSeconds: 10 * 60,
      },
      {
        key: `mellocracia:rl:create:day:${ipHash}`,
        limit: this.config.createRateLimitDay,
        windowSeconds: 24 * 60 * 60,
      },
    ]);
    if (!result.allowed) {
      throw new RateLimitExceededException(
        result.retryAfterSeconds,
        'Poll creation limit reached',
      );
    }
  }

  async enforceVote(ipHash: string, pollKey: string): Promise<void> {
    const result = await this.consumeOrFail([
      {
        key: `mellocracia:rl:vote:minute:${ipHash}:${pollKey}`,
        limit: this.config.voteRateLimitPerMinute,
        windowSeconds: 60,
      },
      {
        key: `mellocracia:rl:vote:global-minute:${ipHash}`,
        limit: this.config.voteGlobalRateLimitPerMinute,
        windowSeconds: 60,
      },
    ]);
    if (!result.allowed) {
      throw new RateLimitExceededException(
        result.retryAfterSeconds,
        'Vote limit reached',
      );
    }
  }

  async enforceRead(ipHash: string, bucket: string): Promise<void> {
    const result = await this.consumeOrFail([
      {
        key: `mellocracia:rl:read:minute:${bucket}:${ipHash}`,
        limit: this.config.readRateLimitPerMinute,
        windowSeconds: 60,
      },
    ]);
    if (!result.allowed) {
      throw new RateLimitExceededException(result.retryAfterSeconds);
    }
  }

  async enforceCatalogRead(ipHash: string): Promise<void> {
    const result = await this.consumeOrFail([
      {
        key: `mellocracia:rl:catalog:minute:${ipHash}`,
        limit: this.config.catalogRateLimitPerMinute,
        windowSeconds: 60,
      },
    ]);
    if (!result.allowed) {
      throw new RateLimitExceededException(result.retryAfterSeconds);
    }
  }

  async enforceResults(ipHash: string, tokenHash: string): Promise<void> {
    const result = await this.consumeOrFail([
      {
        key: `mellocracia:rl:results:ip-minute:${ipHash}`,
        limit: this.config.readRateLimitPerMinute,
        windowSeconds: 60,
      },
      {
        key: `mellocracia:rl:results:token-minute:${tokenHash}`,
        limit: this.config.resultsRateLimitPerMinute,
        windowSeconds: 60,
      },
    ]);
    if (!result.allowed) {
      throw new RateLimitExceededException(result.retryAfterSeconds);
    }
  }

  private async consumeOrFail(windows: readonly RateLimitWindow[]) {
    try {
      return await this.redis.consumeRateLimits(windows);
    } catch {
      // Creation and voting must fail closed when Redis is unavailable. Reads
      // use the same policy to keep an outage from becoming an unbounded load
      // amplifier against PostgreSQL or Ghost.
      throw new RateLimitExceededException(
        30,
        'Rate limiting is temporarily unavailable',
      );
    }
  }
}
