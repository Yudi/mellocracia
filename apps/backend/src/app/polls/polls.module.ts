import { Module } from '@nestjs/common';
import { AppConfig } from '../config/app-config';
import { appConfigProvider } from '../config/config.provider';
import { CatalogModule } from '../catalog/catalog.module';
import { DatabaseModule } from '../database/database.module';
import { SecurityModule } from '../security/security.module';
import { PollCleanupService } from './poll-cleanup.service';
import { PollController } from './poll.controller';
import { PollRepository } from './poll.repository';
import { PollService } from './poll.service';

@Module({
  imports: [CatalogModule, DatabaseModule, SecurityModule],
  controllers: [PollController],
  providers: [
    appConfigProvider,
    PollRepository,
    PollService,
    PollCleanupService,
  ],
  exports: [PollService, AppConfig],
})
export class PollsModule {}
