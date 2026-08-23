import { Global, Module } from '@nestjs/common';
import { AppConfig } from '../config/app-config';
import { appConfigProvider } from '../config/config.provider';
import { RedisService } from './redis.service';

@Global()
@Module({
  providers: [appConfigProvider, RedisService],
  exports: [RedisService, AppConfig],
})
export class RedisModule {}
