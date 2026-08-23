import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { AppConfig } from '../config/app-config';
import { PollRepository } from './poll.repository';

const CLEANUP_INTERVAL_MS = 60 * 60 * 1_000;

@Injectable()
export class PollCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PollCleanupService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly repository: PollRepository,
    private readonly config: AppConfig,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.cleanup();
    }, CLEANUP_INTERVAL_MS);
    this.timer.unref();
    void this.cleanup();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  async cleanup(): Promise<void> {
    try {
      let deleted: number;
      do {
        deleted = await this.repository.deleteExpired(
          this.config.pollCleanupBatchSize,
        );
      } while (deleted >= this.config.pollCleanupBatchSize);
      if (deleted > 0) {
        this.logger.log(`Removed ${deleted} expired poll(s)`);
      }
    } catch (error) {
      this.logger.warn(
        `Expired poll cleanup failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
