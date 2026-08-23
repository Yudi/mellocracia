import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { appConfigProvider } from './config/config.provider';
import { DatabaseModule } from './database/database.module';
import { ApiExceptionFilter } from './http/api-exception.filter';
import { HealthModule } from './health/health.module';
import { PollsModule } from './polls/polls.module';
import { ResultsModule } from './results/results.module';

@Module({
  imports: [DatabaseModule, HealthModule, PollsModule, ResultsModule],
  providers: [
    appConfigProvider,
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
  ],
})
export class AppModule {}
