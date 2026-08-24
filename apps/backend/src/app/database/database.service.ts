import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { AppConfig } from '../config/app-config';
import { PrismaClient } from '../../generated/prisma/client';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  readonly prisma: PrismaClient;

  constructor(config: AppConfig) {
    const pool = new Pool({
      connectionString: config.databaseUrl,
      max: config.databasePoolMax,
      connectionTimeoutMillis: config.databaseConnectionTimeoutMs,
      statement_timeout: config.databaseStatementTimeoutMs,
    });
    const adapter = new PrismaPg(pool, {
      disposeExternalPool: true,
      onPoolError: (error) =>
        this.logger.error(`PostgreSQL pool error: ${error.message}`),
    });
    this.prisma = new PrismaClient({ adapter });
  }

  async onModuleInit(): Promise<void> {
    await this.prisma.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.prisma.$disconnect();
  }

  async ping(): Promise<void> {
    await this.prisma.poll.count({ take: 0 });
  }
}
