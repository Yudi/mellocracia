import { Injectable } from '@nestjs/common';
import { PollOption, PollResultOption } from '@mellocracia/contracts';
import { DatabaseService } from '../database/database.service';

export interface PollSnapshotOption {
  id: string;
  title: string;
  excerpt: string;
  featureImage: string | null;
  featureImageAlt: string | null;
  sourceUrl: string;
  position: number;
  votes: number;
}

export interface PollRecord {
  id: string;
  title: string;
  expiresAt: Date;
  options: PollSnapshotOption[];
}

export interface CreatePollRecord {
  id: string;
  title: string;
  shareTokenHash: string;
  resultsTokenHash: string;
  expiresAt: Date;
  options: readonly PollOption[];
}

@Injectable()
export class PollRepository {
  constructor(private readonly database: DatabaseService) {}

  async create(record: CreatePollRecord): Promise<void> {
    await this.database.withTransaction(async (client) => {
      await client.query(
        `INSERT INTO polls (id, title, share_token_hash, results_token_hash, expires_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          record.id,
          record.title,
          record.shareTokenHash,
          record.resultsTokenHash,
          record.expiresAt,
        ],
      );

      if (record.options.length === 0) {
        return;
      }

      const parameters: unknown[] = [];
      const rows = record.options.map((option, position) => {
        const firstParameter = parameters.length + 1;
        parameters.push(
          record.id,
          option.id,
          option.title,
          option.excerpt,
          option.featureImage,
          option.featureImageAlt,
          option.sourceUrl,
          position,
        );
        return `(${Array.from({ length: 8 }, (_, offset) => `$${firstParameter + offset}`).join(', ')})`;
      });
      await client.query(
        `INSERT INTO poll_options
           (poll_id, post_id, title, excerpt, feature_image, feature_image_alt, source_url, position)
         VALUES ${rows.join(', ')}`,
        parameters,
      );
    });
  }

  async findByShareTokenHash(
    shareTokenHash: string,
  ): Promise<PollRecord | undefined> {
    return this.findByTokenHash('share_token_hash', shareTokenHash);
  }

  async findByResultsTokenHash(
    resultsTokenHash: string,
  ): Promise<PollRecord | undefined> {
    return this.findByTokenHash('results_token_hash', resultsTokenHash);
  }

  private async findByTokenHash(
    column: 'share_token_hash' | 'results_token_hash',
    tokenHash: string,
  ): Promise<PollRecord | undefined> {
    const result = await this.database.query<{
      poll_id: string;
      title: string;
      expires_at: Date;
      post_id: string;
      option_title: string;
      excerpt: string;
      feature_image: string | null;
      feature_image_alt: string | null;
      source_url: string;
      position: number;
      vote_count: number;
    }>(
      `SELECT p.id AS poll_id,
              p.title,
              p.expires_at,
              o.post_id,
              o.title AS option_title,
              o.excerpt,
              o.feature_image,
              o.feature_image_alt,
              o.source_url,
              o.position,
              o.vote_count
         FROM polls p
         JOIN poll_options o ON o.poll_id = p.id
        WHERE p.${column} = $1
          AND p.expires_at > CURRENT_TIMESTAMP
        ORDER BY o.position ASC`,
      [tokenHash],
    );

    if (result.rowCount === 0) {
      return undefined;
    }

    const first = result.rows[0];
    return {
      id: first.poll_id,
      title: first.title,
      expiresAt: new Date(first.expires_at),
      options: result.rows.map((row) => ({
        id: row.post_id,
        title: row.option_title,
        excerpt: row.excerpt,
        featureImage: row.feature_image,
        featureImageAlt: row.feature_image_alt,
        sourceUrl: row.source_url,
        position: row.position,
        votes: Number(row.vote_count),
      })),
    };
  }

  async castVote(
    pollId: string,
    voterNonceHash: string,
    optionId: string,
    maxVotes: number,
  ): Promise<
    'accepted' | 'duplicate' | 'invalid-option' | 'expired' | 'capacity'
  > {
    return this.database.withTransaction(async (client) => {
      const poll = await client.query<{ id: string; total_votes: number }>(
        `SELECT id, total_votes
           FROM polls
          WHERE id = $1 AND expires_at > CURRENT_TIMESTAMP
          FOR UPDATE`,
        [pollId],
      );
      if (poll.rowCount === 0) {
        return 'expired';
      }
      if (Number(poll.rows[0].total_votes) >= maxVotes) {
        return 'capacity';
      }

      const option = await client.query<{ post_id: string }>(
        `SELECT post_id FROM poll_options WHERE poll_id = $1 AND post_id = $2`,
        [pollId, optionId],
      );
      if (option.rowCount === 0) {
        return 'invalid-option';
      }

      const inserted = await client.query(
        `INSERT INTO poll_votes (poll_id, voter_nonce_hash, option_post_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (poll_id, voter_nonce_hash) DO NOTHING
         RETURNING poll_id`,
        [pollId, voterNonceHash, optionId],
      );
      if (inserted.rowCount === 0) {
        return 'duplicate';
      }

      await client.query(
        `UPDATE poll_options SET vote_count = vote_count + 1
          WHERE poll_id = $1 AND post_id = $2`,
        [pollId, optionId],
      );
      await client.query(
        'UPDATE polls SET total_votes = total_votes + 1 WHERE id = $1',
        [pollId],
      );
      return 'accepted';
    });
  }

  async findResults(resultsTokenHash: string): Promise<
    | {
        title: string;
        expiresAt: Date;
        totalVotes: number;
        options: PollResultOption[];
      }
    | undefined
  > {
    const record = await this.findByResultsTokenHash(resultsTokenHash);
    if (!record) {
      return undefined;
    }
    const totalVotes = record.options.reduce(
      (total, option) => total + option.votes,
      0,
    );
    return {
      title: record.title,
      expiresAt: record.expiresAt,
      totalVotes,
      options: record.options.map((option) => ({
        id: option.id,
        title: option.title,
        excerpt: option.excerpt,
        featureImage: option.featureImage,
        featureImageAlt: option.featureImageAlt,
        sourceUrl: option.sourceUrl,
        votes: option.votes,
        percentage:
          totalVotes === 0
            ? 0
            : Number(((option.votes / totalVotes) * 100).toFixed(2)),
      })),
    };
  }

  async deleteExpired(batchSize: number): Promise<number> {
    const result = await this.database.query<{ id: string }>(
      `DELETE FROM polls
        WHERE id IN (
          SELECT id FROM polls
           WHERE expires_at <= CURRENT_TIMESTAMP
           ORDER BY expires_at ASC
           LIMIT $1
        )
      RETURNING id`,
      [batchSize],
    );
    return result.rowCount ?? 0;
  }
}
