import { BadRequestException } from '@nestjs/common';
import { POLL_LIMITS } from '@mellocracia/contracts';

export function validatePollCreationInput(
  titleValue: unknown,
  durationValue: unknown,
  optionPostIds: unknown,
  maxOptions: number,
): { title: string; durationHours: number; optionPostIds: string[] } {
  const title = typeof titleValue === 'string' ? titleValue.trim() : '';
  const durationHours = Number(durationValue);
  if (!title || title.length > 120) {
    throw new BadRequestException({
      code: 'INVALID_TITLE',
      message: 'Title must be 1 to 120 characters',
    });
  }
  if (
    !Number.isInteger(durationHours) ||
    durationHours < POLL_LIMITS.minDurationHours ||
    durationHours > POLL_LIMITS.maxDurationHours
  ) {
    throw new BadRequestException({
      code: 'INVALID_DURATION',
      message: `Duration must be between ${POLL_LIMITS.minDurationHours} and ${POLL_LIMITS.maxDurationHours} hours`,
    });
  }
  if (!Array.isArray(optionPostIds)) {
    throw new BadRequestException({
      code: 'INVALID_OPTIONS',
      message: 'Select at least two posts',
    });
  }
  if (
    optionPostIds.length < 2 ||
    optionPostIds.length > maxOptions ||
    optionPostIds.some(
      (id) => typeof id !== 'string' || id.length === 0 || id.length > 256,
    )
  ) {
    throw new BadRequestException({
      code: 'INVALID_OPTIONS',
      message: 'Selected posts are outside the allowed range',
    });
  }
  const ids = optionPostIds as string[];
  if (new Set(ids).size !== ids.length) {
    throw new BadRequestException({
      code: 'DUPLICATE_OPTIONS',
      message: 'Each post can only appear once',
    });
  }
  return { title, durationHours, optionPostIds: ids };
}
