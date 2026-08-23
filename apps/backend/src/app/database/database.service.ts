import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { AppConfig } from '../config/app-config';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private pool?: Pool;

  constructor(private readonly config: AppConfig) {}

  async onModuleInit(): Promise<void> {
    this.pool = new Pool({
      connectionString: this.config.databaseUrl,
      max: this.config.databasePoolMax,
      connectionTimeoutMillis: this.config.databaseConnectionTimeoutMs,
      statement_timeout: this.config.databaseStatementTimeoutMs,
    });
    this.pool.on('error', (error) =>
      this.logger.error(`PostgreSQL pool error: ${error.message}`),
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }

  private getPool(): Pool {
    if (!this.pool) {
      throw new Error('Database pool is not initialized');
    }
    return this.pool;
  }

  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<T>> {
    return this.getPool().query<T>(text, values);
  }

  async withTransaction<T>(
    callback: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.getPool().connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async ping(): Promise<void> {
    await this.getPool().query('SELECT 1');
  }
}
