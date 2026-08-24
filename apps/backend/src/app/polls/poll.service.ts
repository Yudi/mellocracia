import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CatalogItem,
  CastVoteResponse,
  CreatePollRequest,
  CreatePollResponse,
  PollResponse,
  PollResultsResponse,
} from '@mellocracia/contracts';
import { randomUUID } from 'node:crypto';
import { AppConfig } from '../config/app-config';
import { CatalogService } from '../catalog/catalog.service';
import { PollRepository } from './poll.repository';
import {
  validatePollCreationInput,
  validateVoteOptionIds,
} from './poll.validation';
import {
  createOpaqueToken,
  cryptographicallyShuffle,
  hashSecret,
  isOpaqueToken,
} from '../security/crypto.util';
import { RateLimitService } from '../security/rate-limit.service';
import { TurnstileService } from '../security/turnstile.service';

export const POLL_NOT_FOUND_MESSAGE = 'Poll not found or expired';

@Injectable()
export class PollService {
  constructor(
    private readonly repository: PollRepository,
    private readonly catalog: CatalogService,
    private readonly config: AppConfig,
    private readonly rateLimit: RateLimitService,
    private readonly turnstile: TurnstileService,
  ) {}

  async createPoll(
    input: CreatePollRequest,
    ipHash: string,
  ): Promise<CreatePollResponse> {
    await this.rateLimit.enforceCreate(ipHash);
    await this.turnstile.verify(input.turnstileToken);

    const validated = validatePollCreationInput(
      input.title,
      input.durationHours,
      input.optionPostIds,
      this.config.maxPollOptions,
    );
    const { title, durationHours, optionPostIds } = validated;
    const catalog = await this.catalog.getFreshOrStaleCatalog();
    const catalogById = new Map(catalog.items.map((item) => [item.id, item]));
    const selected = optionPostIds.map((id) => catalogById.get(id));
    if (selected.some((item) => !item)) {
      throw new BadRequestException({
        code: 'INVALID_OPTIONS',
        message: 'One or more selected posts are no longer available',
      });
    }

    const shareToken = createOpaqueToken();
    const resultsToken = createOpaqueToken();
    const expiresAt = new Date(Date.now() + durationHours * 60 * 60 * 1_000);
    await this.repository.create({
      id: randomUUID(),
      title,
      shareTokenHash: hashSecret(shareToken, this.config.tokenHashSecret),
      resultsTokenHash: hashSecret(resultsToken, this.config.tokenHashSecret),
      expiresAt,
      options: (selected as CatalogItem[]).map((item) => ({
        id: item.id,
        title: item.title,
        excerpt: item.excerpt,
        tags: item.tags,
        featureImage: item.featureImage,
        featureImageAlt: item.featureImageAlt,
        sourceUrl: item.url,
      })),
    });

    return {
      voteUrl: `${this.config.publicOrigin}${this.config.votePathPrefix}/${shareToken}`,
      resultsUrl: `${this.config.publicOrigin}${this.config.resultsPathPrefix}/${resultsToken}`,
      expiresAt: expiresAt.toISOString(),
      optionCount: selected.length,
    };
  }

  async getPoll(shareToken: string): Promise<PollResponse> {
    this.ensureOpaqueToken(shareToken);
    const record = await this.repository.findByShareTokenHash(
      hashSecret(shareToken, this.config.tokenHashSecret),
    );
    if (!record) {
      throw this.notFound();
    }
    return {
      title: record.title,
      expiresAt: record.expiresAt.toISOString(),
      options: cryptographicallyShuffle(record.options).map((option) => ({
        id: option.id,
        title: option.title,
        excerpt: option.excerpt,
        tags: option.tags,
        featureImage: option.featureImage,
        featureImageAlt: option.featureImageAlt,
        sourceUrl: option.sourceUrl,
      })),
    };
  }

  async castVote(
    shareToken: string,
    optionIds: unknown,
    voterNonce: string | undefined,
    ipHash: string,
    turnstileToken?: string,
  ): Promise<CastVoteResponse> {
    const candidateToken =
      typeof shareToken === 'string' && shareToken.length <= 128
        ? shareToken
        : 'invalid';
    const tokenHash = hashSecret(candidateToken, this.config.tokenHashSecret);
    await this.rateLimit.enforceVote(ipHash, tokenHash);
    this.ensureOpaqueToken(shareToken);
    if (!isOpaqueToken(voterNonce)) {
      throw new BadRequestException({
        code: 'VOTER_COOKIE_REQUIRED',
        message: 'Open the poll before voting',
      });
    }
    const validatedOptionIds = validateVoteOptionIds(
      optionIds,
      this.config.maxPollOptions,
    );

    await this.turnstile.verify(turnstileToken);
    const record = await this.repository.findByShareTokenHash(tokenHash);
    if (!record) {
      throw this.notFound();
    }
    const result = await this.repository.castVote(
      record.id,
      hashSecret(voterNonce, this.config.tokenHashSecret),
      validatedOptionIds,
      this.config.maxVotesPerPoll,
    );
    if (result === 'expired' || result === 'invalid-option') {
      throw this.notFound();
    }
    if (result === 'duplicate') {
      throw new ConflictException({
        code: 'VOTE_ALREADY_CAST',
        message: 'This browser has already voted',
      });
    }
    if (result === 'capacity') {
      throw new ConflictException({
        code: 'POLL_VOTE_CAPACITY',
        message: 'This poll cannot accept more votes',
      });
    }
    return { accepted: true, message: 'Vote recorded' };
  }

  async getResults(resultsToken: string): Promise<PollResultsResponse> {
    this.ensureOpaqueToken(resultsToken);
    const result = await this.repository.findResults(
      hashSecret(resultsToken, this.config.tokenHashSecret),
    );
    if (!result) {
      throw this.notFound();
    }
    return {
      title: result.title,
      expiresAt: result.expiresAt.toISOString(),
      totalVotes: result.totalVotes,
      options: result.options,
    };
  }

  private ensureOpaqueToken(token: string): void {
    if (!isOpaqueToken(token)) {
      throw this.notFound();
    }
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: 'POLL_NOT_FOUND',
      message: POLL_NOT_FOUND_MESSAGE,
    });
  }
}
