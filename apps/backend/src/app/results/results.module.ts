import { Module } from '@nestjs/common';
import { PollsModule } from '../polls/polls.module';
import { SecurityModule } from '../security/security.module';
import { ResultsController } from './results.controller';

@Module({
  imports: [PollsModule, SecurityModule],
  controllers: [ResultsController],
})
export class ResultsModule {}
