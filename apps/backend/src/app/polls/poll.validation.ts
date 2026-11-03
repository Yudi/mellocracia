import { BadRequestException } from '@nestjs/common';
import { getMaxPollEndDate, POLL_LIMITS } from '@mellocracia/contracts';

export function validateVoterName(
  value: unknown,
  required: boolean,
): string | null {
  if (
    value !== undefined &&
    (typeof value !== 'string' || value.length > POLL_LIMITS.maxVoterNameLength)
  ) {
    throw new BadRequestException({
      code: 'INVALID_VOTER_NAME',
      message: 'O nome deve ter no máximo 120 caracteres.',
    });
  }
  const name = typeof value === 'string' ? value.trim() : '';
  if (required && !name) {
    throw new BadRequestException({
      code: 'VOTER_NAME_REQUIRED',
      message: 'Informe seu nome para votar.',
    });
  }
  return name || null;
}

export function validatePollCreationInput(
  titleValue: unknown,
  durationValue: unknown,
  optionPostIds: unknown,
  maxOptions: number,
  closesAtValue?: unknown,
  now = new Date(),
): {
  title: string;
  durationDays: number | undefined;
  closesAt: Date;
  optionPostIds: string[];
} {
  const title = typeof titleValue === 'string' ? titleValue.trim() : '';
  const durationDays =
    durationValue === undefined ? undefined : Number(durationValue);
  if (!title || title.length > 120) {
    throw new BadRequestException({
      code: 'INVALID_TITLE',
      message: 'Title must be 1 to 120 characters',
    });
  }
  if (
    closesAtValue === undefined &&
    (durationDays === undefined ||
      !Number.isInteger(durationDays) ||
      durationDays < POLL_LIMITS.minDurationDays ||
      durationDays > POLL_LIMITS.maxDurationDays)
  ) {
    throw new BadRequestException({
      code: 'INVALID_DURATION',
      message: `Duration must be between ${POLL_LIMITS.minDurationDays} and ${POLL_LIMITS.maxDurationDays} days`,
    });
  }
  const closesAt = validatePollEndDate(durationDays, closesAtValue, now);
  const optionPostIdsResult = validatePollOptionPostIds(
    optionPostIds,
    maxOptions,
  );
  return { title, durationDays, closesAt, optionPostIds: optionPostIdsResult };
}

export function validatePollEndDate(
  durationDays: number | undefined,
  closesAtValue: unknown,
  now = new Date(),
): Date {
  if (closesAtValue !== undefined && durationDays !== undefined) {
    throw new BadRequestException({
      code: 'INVALID_END_DATE',
      message: 'Escolha uma duração ou uma data de encerramento.',
    });
  }
  const closesAt =
    closesAtValue === undefined
      ? new Date(now.getTime() + (durationDays ?? NaN) * 24 * 60 * 60 * 1_000)
      : new Date(typeof closesAtValue === 'string' ? closesAtValue : NaN);
  if (
    !Number.isFinite(closesAt.getTime()) ||
    closesAt <= now ||
    closesAt > getMaxPollEndDate(now)
  ) {
    throw new BadRequestException({
      code: 'INVALID_END_DATE',
      message: 'Escolha uma data futura, no máximo um mês a partir de agora.',
    });
  }
  return closesAt;
}

export function validatePollOptionPostIds(
  optionPostIds: unknown,
  maxOptions: number,
): string[] {
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
  return ids;
}

export function validateVoteOptionIds(
  optionIds: unknown,
  maxOptions: number,
): string[] {
  if (
    !Array.isArray(optionIds) ||
    optionIds.length === 0 ||
    optionIds.length > maxOptions ||
    optionIds.some(
      (id) => typeof id !== 'string' || id.length === 0 || id.length > 256,
    )
  ) {
    throw new BadRequestException({
      code: 'INVALID_OPTIONS',
      message: 'Choose at least one valid option',
    });
  }

  const ids = optionIds as string[];
  if (new Set(ids).size !== ids.length) {
    throw new BadRequestException({
      code: 'DUPLICATE_OPTIONS',
      message: 'Each option can only be selected once',
    });
  }
  return ids;
}
