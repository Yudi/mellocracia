import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { POLL_LIMITS } from '@mellocracia/contracts';

export class CreatePollDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  requireVoterName?: boolean;

  @IsString()
  @MaxLength(POLL_LIMITS.maxTitleLength)
  title!: string;

  @ValidateIf((_object, value) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(POLL_LIMITS.minDurationDays)
  @Max(POLL_LIMITS.maxDurationDays)
  durationDays?: number;

  @ValidateIf((_object, value) => value !== undefined)
  @IsISO8601({ strict: true })
  closesAt?: string;

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
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(POLL_LIMITS.maxVoterNameLength)
  voterName?: string;

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
