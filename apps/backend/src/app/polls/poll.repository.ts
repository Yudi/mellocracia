import { Injectable } from '@nestjs/common';
import { PollOption, PollResultOption } from '@mellocracia/contracts';
import { DatabaseService } from '../database/database.service';
import { Prisma } from '../../generated/prisma/client';

export interface PollSnapshotOption {
  id: string;
  title: string;
  excerpt: string;
  tags: string[];
  featureImage: string | null;
  featureImageAlt: string | null;
  sourceUrl: string;
  position: number;
  votes: number;
}

export interface PollRecord {
  id: string;
  title: string;
  closesAt: Date;
  expiresAt: Date;
  totalVotes: number;
  hasVoted: boolean;
  options: PollSnapshotOption[];
}

export interface CreatePollRecord {
  id: string;
  title: string;
  shareTokenHash: string;
  editTokenHash: string;
  closesAt: Date;
  expiresAt: Date;
  options: readonly PollOption[];
}

@Injectable()
export class PollRepository {
  constructor(private readonly database: DatabaseService) {}

  async create(record: CreatePollRecord): Promise<void> {
    await this.database.prisma.poll.create({
      data: {
        id: record.id,
        title: record.title,
        shareTokenHash: record.shareTokenHash,
        editTokenHash: record.editTokenHash,
        closesAt: record.closesAt,
        expiresAt: record.expiresAt,
        options: {
          create: record.options.map((option, position) => ({
            postId: option.id,
            title: option.title,
            excerpt: option.excerpt,
            tags: option.tags,
            featureImage: option.featureImage,
            featureImageAlt: option.featureImageAlt,
            sourceUrl: option.sourceUrl,
            position,
          })),
        },
      },
    });
  }

  async findByShareTokenHash(
    shareTokenHash: string,
    voterNonceHash?: string,
  ): Promise<PollRecord | undefined> {
    return this.findActiveByTokenHash({ shareTokenHash }, voterNonceHash);
  }

  async findByEditTokenHash(
    editTokenHash: string,
  ): Promise<PollRecord | undefined> {
    return this.findActiveByTokenHash({ editTokenHash });
  }

  private async findActiveByTokenHash(
    token: {
      shareTokenHash?: string;
      editTokenHash?: string;
    },
    voterNonceHash?: string,
  ): Promise<PollRecord | undefined> {
    const poll = await this.database.prisma.poll.findFirst({
      where: {
        ...token,
        closesAt: { gt: new Date() },
      },
      include: {
        options: {
          orderBy: { position: 'asc' },
        },
        votes: {
          where: { voterNonceHash: voterNonceHash ?? '' },
          select: { pollId: true },
          take: 1,
        },
      },
    });

    if (!poll || poll.options.length === 0) {
      return undefined;
    }

    return {
      id: poll.id,
      title: poll.title,
      closesAt: poll.closesAt,
      expiresAt: poll.expiresAt,
      totalVotes: poll.totalVotes,
      hasVoted: poll.votes.length > 0,
      options: poll.options.map((option) => ({
        id: option.postId,
        title: option.title,
        excerpt: option.excerpt,
        tags: option.tags,
        featureImage: option.featureImage,
        featureImageAlt: option.featureImageAlt,
        sourceUrl: option.sourceUrl,
        position: option.position,
        votes: option.voteCount,
      })),
    };
  }

  async replaceOptions(
    pollId: string,
    options: readonly PollOption[],
  ): Promise<'updated' | 'expired' | 'voted'> {
    return this.database.prisma.$transaction(
      async (transaction) => {
        const poll = await transaction.poll.findFirst({
          where: { id: pollId, closesAt: { gt: new Date() } },
          select: { totalVotes: true },
        });
        if (!poll) {
          return 'expired';
        }
        if (poll.totalVotes > 0) {
          return 'voted';
        }

        await transaction.pollOption.deleteMany({ where: { pollId } });
        await transaction.pollOption.createMany({
          data: options.map((option, position) => ({
            pollId,
            postId: option.id,
            title: option.title,
            excerpt: option.excerpt,
            tags: option.tags,
            featureImage: option.featureImage,
            featureImageAlt: option.featureImageAlt,
            sourceUrl: option.sourceUrl,
            position,
          })),
        });
        return 'updated';
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async castVote(
    pollId: string,
    voterNonceHash: string,
    optionIds: readonly string[],
    maxVotes: number,
  ): Promise<
    'accepted' | 'duplicate' | 'invalid-option' | 'expired' | 'capacity'
  > {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.castVoteAttempt(
          pollId,
          voterNonceHash,
          optionIds,
          maxVotes,
        );
      } catch (error) {
        if (this.isPrismaError(error, 'P2002')) {
          return 'duplicate';
        }
        if (this.isPrismaError(error, 'P2034') && attempt < 2) {
          continue;
        }
        throw error;
      }
    }

    throw new Error('Vote transaction exhausted retries');
  }

  async findResults(shareTokenHash: string): Promise<
    | {
        title: string;
        closesAt: Date;
        expiresAt: Date;
        totalVotes: number;
        options: PollResultOption[];
      }
    | undefined
  > {
    const poll = await this.database.prisma.poll.findFirst({
      where: { shareTokenHash, expiresAt: { gt: new Date() } },
      include: { options: { orderBy: { position: 'asc' } } },
    });
    if (!poll || poll.options.length === 0) {
      return undefined;
    }
    const totalVotes = poll.totalVotes;
    return {
      title: poll.title,
      closesAt: poll.closesAt,
      expiresAt: poll.expiresAt,
      totalVotes,
      options: poll.options.map((option) => ({
        id: option.postId,
        title: option.title,
        excerpt: option.excerpt,
        tags: option.tags,
        featureImage: option.featureImage,
        featureImageAlt: option.featureImageAlt,
        sourceUrl: option.sourceUrl,
        votes: option.voteCount,
        percentage:
          totalVotes === 0
            ? 0
            : Number(((option.voteCount / totalVotes) * 100).toFixed(2)),
      })),
    };
  }

  async deleteExpired(batchSize: number): Promise<number> {
    return this.database.prisma.$transaction(async (transaction) => {
      const expired = await transaction.poll.findMany({
        where: { expiresAt: { lte: new Date() } },
        orderBy: { expiresAt: 'asc' },
        take: batchSize,
        select: { id: true },
      });
      if (expired.length === 0) {
        return 0;
      }
      const result = await transaction.poll.deleteMany({
        where: { id: { in: expired.map((poll) => poll.id) } },
      });
      return result.count;
    });
  }

  private async castVoteAttempt(
    pollId: string,
    voterNonceHash: string,
    optionIds: readonly string[],
    maxVotes: number,
  ): Promise<
    'accepted' | 'duplicate' | 'invalid-option' | 'expired' | 'capacity'
  > {
    return this.database.prisma.$transaction(
      async (transaction) => {
        const poll = await transaction.poll.findFirst({
          where: { id: pollId, closesAt: { gt: new Date() } },
          select: { totalVotes: true },
        });
        if (!poll) {
          return 'expired';
        }
        if (poll.totalVotes >= maxVotes) {
          return 'capacity';
        }

        const options = await transaction.pollOption.findMany({
          where: { pollId, postId: { in: [...optionIds] } },
          select: { postId: true },
        });
        if (options.length !== optionIds.length) {
          return 'invalid-option';
        }

        const existingVote = await transaction.pollVote.findFirst({
          where: { pollId, voterNonceHash },
          select: { pollId: true },
        });
        if (existingVote) {
          return 'duplicate';
        }

        await transaction.pollVote.createMany({
          data: optionIds.map((optionPostId) => ({
            pollId,
            voterNonceHash,
            optionPostId,
          })),
        });
        await transaction.pollOption.updateMany({
          where: { pollId, postId: { in: [...optionIds] } },
          data: { voteCount: { increment: 1 } },
        });
        await transaction.poll.update({
          where: { id: pollId },
          data: { totalVotes: { increment: 1 } },
        });
        return 'accepted';
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private isPrismaError(error: unknown, code: string): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === code
    );
  }
}
