import { Pool } from 'pg';
import { AppConfig } from '../config/app-config';

export interface Migration {
  id: string;
  sql: string;
}

/**
 * Keep migrations ordered and append-only. Every statement is idempotent so a
 * partially completed local migration can safely be retried.
 */
export const MIGRATIONS: readonly Migration[] = [
  {
    id: '202608230001_initial_poll_schema',
    sql: `
      CREATE TABLE IF NOT EXISTS polls (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        share_token_hash TEXT NOT NULL UNIQUE,
        results_token_hash TEXT NOT NULL UNIQUE,
        expires_at TIMESTAMPTZ NOT NULL,
        total_votes INTEGER NOT NULL DEFAULT 0 CHECK (total_votes >= 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS polls_expires_at_idx ON polls (expires_at);

      CREATE TABLE IF NOT EXISTS poll_options (
        poll_id TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
        post_id TEXT NOT NULL,
        title TEXT NOT NULL,
        excerpt TEXT NOT NULL DEFAULT '',
        feature_image TEXT,
        feature_image_alt TEXT,
        source_url TEXT NOT NULL,
        position INTEGER NOT NULL,
        vote_count INTEGER NOT NULL DEFAULT 0 CHECK (vote_count >= 0),
        PRIMARY KEY (poll_id, post_id),
        UNIQUE (poll_id, position)
      );

      CREATE INDEX IF NOT EXISTS poll_options_poll_id_idx ON poll_options (poll_id);

      CREATE TABLE IF NOT EXISTS poll_votes (
        poll_id TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
        voter_nonce_hash TEXT NOT NULL,
        option_post_id TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (poll_id, voter_nonce_hash),
        FOREIGN KEY (poll_id, option_post_id)
          REFERENCES poll_options(poll_id, post_id)
          ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS poll_votes_poll_id_idx ON poll_votes (poll_id);
    `,
  },
  {
    id: '202608230002_poll_vote_capacity',
    sql: `
      ALTER TABLE polls
        ADD COLUMN IF NOT EXISTS total_votes INTEGER NOT NULL DEFAULT 0;
    `,
  },
];

export async function runMigrations(config = new AppConfig()): Promise<void> {
  const pool = new Pool({ connectionString: config.databaseUrl });
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    for (const migration of MIGRATIONS) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await client.query<{ id: string }>(
          'SELECT id FROM schema_migrations WHERE id = $1',
          [migration.id],
        );
        if (result.rowCount === 0) {
          await client.query(migration.sql);
          await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [
            migration.id,
          ]);
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    }
  } finally {
    await pool.end();
  }
}
