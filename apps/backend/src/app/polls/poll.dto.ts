import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { POLL_LIMITS } from '@mellocracia/contracts';

export class CreatePollDto {
  @IsString()
  @MaxLength(POLL_LIMITS.maxTitleLength)
  title!: string;

  @Type(() => Number)
  @IsInt()
  @Min(POLL_LIMITS.minDurationHours)
  @Max(POLL_LIMITS.maxDurationHours)
  durationHours!: number;

  @IsArray()
  @ArrayMinSize(POLL_LIMITS.minOptions)
  @ArrayMaxSize(POLL_LIMITS.maxOptions)
  @IsString({ each: true })
  @MaxLength(256, { each: true })
  optionPostIds!: string[];

  @IsOptional()
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(2_048)
  turnstileToken?: string;
}

export class CastVoteDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(POLL_LIMITS.maxOptions)
  @IsString({ each: true })
  @MaxLength(256, { each: true })
  optionIds!: string[];

  @IsOptional()
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(2_048)
  turnstileToken?: string;
}

export class UpdatePollChoicesDto {
  @IsArray()
  @ArrayMinSize(POLL_LIMITS.minOptions)
  @ArrayMaxSize(POLL_LIMITS.maxOptions)
  @IsString({ each: true })
  @MaxLength(256, { each: true })
  optionPostIds!: string[];
}
