import { Global, Module } from '@nestjs/common';
import { AppConfig } from '../config/app-config';
import { appConfigProvider } from '../config/config.provider';
import { DatabaseService } from './database.service';

@Global()
@Module({
  providers: [appConfigProvider, DatabaseService],
  exports: [DatabaseService, AppConfig],
})
export class DatabaseModule {}
