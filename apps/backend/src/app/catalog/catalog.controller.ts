import { Controller, Get, Req } from '@nestjs/common';
import { CatalogResponse } from '@mellocracia/contracts';
import { CatalogService } from './catalog.service';
import { ClientIpService } from '../security/client-ip.service';
import { RateLimitService } from '../security/rate-limit.service';

@Controller('catalog')
export class CatalogController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly clientIp: ClientIpService,
    private readonly rateLimit: RateLimitService,
  ) {}

  @Get()
  async getCatalog(@Req() request: unknown): Promise<CatalogResponse> {
    await this.rateLimit.enforceCatalogRead(
      this.clientIp.hashRequestIp(request),
    );
    return this.catalog.getCatalog();
  }
}
