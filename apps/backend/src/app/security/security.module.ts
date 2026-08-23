import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AppConfig } from '../config/app-config';
import { appConfigProvider } from '../config/config.provider';
import { RedisModule } from '../redis/redis.module';
import { ClientIpService } from './client-ip.service';
import { RateLimitService } from './rate-limit.service';
import { SecurityHeadersInterceptor } from './security.interceptor';
import { TurnstileService } from './turnstile.service';

@Module({
  imports: [RedisModule],
  providers: [
    appConfigProvider,
    ClientIpService,
    RateLimitService,
    TurnstileService,
    { provide: APP_INTERCEPTOR, useClass: SecurityHeadersInterceptor },
  ],
  exports: [ClientIpService, RateLimitService, TurnstileService, AppConfig],
})
export class SecurityModule {}
