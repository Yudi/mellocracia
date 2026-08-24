import { Body, Controller, Get, Param, Post, Req, Res } from '@nestjs/common';
import { CreatePollResponse, PollResponse } from '@mellocracia/contracts';
import type { Response } from 'express';
import { AppConfig } from '../config/app-config';
import { ClientIpService } from '../security/client-ip.service';
import { createOpaqueToken, isOpaqueToken } from '../security/crypto.util';
import { RateLimitService } from '../security/rate-limit.service';
import { CastVoteDto, CreatePollDto } from './poll.dto';
import { PollService } from './poll.service';

@Controller('polls')
export class PollController {
  constructor(
    private readonly polls: PollService,
    private readonly clientIp: ClientIpService,
    private readonly rateLimit: RateLimitService,
    private readonly config: AppConfig,
  ) {}

  @Post()
  async create(
    @Body() body: CreatePollDto,
    @Req() request: unknown,
  ): Promise<CreatePollResponse> {
    return this.polls.createPoll(body, this.clientIp.hashRequestIp(request));
  }

  @Get(':shareToken')
  async get(
    @Param('shareToken') shareToken: string,
    @Req() request: unknown,
    @Res({ passthrough: true }) response: Response,
  ): Promise<PollResponse> {
    await this.rateLimit.enforceRead(
      this.clientIp.hashRequestIp(request),
      'poll',
    );
    const poll = await this.polls.getPoll(shareToken);
    const cookies = (
      request as { cookies?: Record<string, string | undefined> }
    ).cookies;
    const currentNonce = cookies?.[this.config.cookieName];
    const nonce = this.isOpaqueNonce(currentNonce)
      ? currentNonce
      : this.createNonce();
    if (nonce !== currentNonce) {
      response.cookie(this.config.cookieName, nonce, {
        httpOnly: true,
        sameSite: 'lax',
        secure: this.config.cookieSecure,
        maxAge:
          Math.max(
            1,
            Math.floor(
              (new Date(poll.expiresAt).getTime() - Date.now()) / 1_000,
            ),
          ) * 1_000,
        path: '/',
      });
    }
    response.header('Vary', 'Cookie');
    return poll;
  }

  @Post(':shareToken/votes')
  async vote(
    @Param('shareToken') shareToken: string,
    @Body() body: CastVoteDto,
    @Req() request: unknown,
  ) {
    const cookies = (
      request as { cookies?: Record<string, string | undefined> }
    ).cookies;
    const nonce = cookies?.[this.config.cookieName];
    return this.polls.castVote(
      shareToken,
      body.optionIds,
      nonce,
      this.clientIp.hashRequestIp(request),
      body.turnstileToken,
    );
  }

  private isOpaqueNonce(value: unknown): value is string {
    return isOpaqueToken(value);
  }

  private createNonce(): string {
    return createOpaqueToken();
  }
}
