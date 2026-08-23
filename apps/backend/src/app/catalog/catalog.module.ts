import { Module } from '@nestjs/common';
import { AppConfig } from '../config/app-config';
import { appConfigProvider } from '../config/config.provider';
import { RedisModule } from '../redis/redis.module';
import { SecurityModule } from '../security/security.module';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';

@Module({
  imports: [RedisModule, SecurityModule],
  controllers: [CatalogController],
  providers: [appConfigProvider, CatalogService],
  exports: [CatalogService, AppConfig],
})
export class CatalogModule {}
