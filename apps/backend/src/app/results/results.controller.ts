import { Controller, Get, Param, Req } from '@nestjs/common';
import { PollResultsResponse } from '@mellocracia/contracts';
import { AppConfig } from '../config/app-config';
import { ClientIpService } from '../security/client-ip.service';
import { hashSecret } from '../security/crypto.util';
import { RateLimitService } from '../security/rate-limit.service';
import { PollService } from '../polls/poll.service';

@Controller('results')
export class ResultsController {
  constructor(
    private readonly polls: PollService,
    private readonly clientIp: ClientIpService,
    private readonly rateLimit: RateLimitService,
    private readonly config: AppConfig,
  ) {}

  @Get(':resultsToken')
  async get(
    @Param('resultsToken') resultsToken: string,
    @Req() request: unknown,
  ): Promise<PollResultsResponse> {
    const candidate = resultsToken.length <= 128 ? resultsToken : 'invalid';
    await this.rateLimit.enforceResults(
      this.clientIp.hashRequestIp(request),
      hashSecret(candidate, this.config.tokenHashSecret),
    );
    return this.polls.getResults(resultsToken);
  }
}
