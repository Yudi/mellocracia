export const POLL_LIMITS = {
  minOptions: 2,
  maxOptions: 1_000,
  minDurationDays: 1,
  maxDurationDays: 14,
  maxDurationMonths: 1,
  maxTitleLength: 120,
  maxVoterNameLength: 120,
  maxCatalogPosts: 1_000,
} as const;

export interface CatalogItem {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  tags: string[];
  featureImage: string | null;
  featureImageAlt: string | null;
  publishedAt: string;
  url: string;
}

export interface CatalogResponse {
  items: CatalogItem[];
  fetchedAt: string;
  stale: boolean;
}

export interface CreatePollRequest {
  requireVoterName?: boolean;
  title: string;
  durationDays?: number;
  closesAt?: string;
  optionPostIds: string[];
  turnstileToken?: string;
}

export interface CreatePollResponse {
  voteUrl: string;
  resultsUrl: string;
  editUrl: string;
  closesAt: string;
  expiresAt: string;
  optionCount: number;
}

export interface PollOption {
  id: string;
  title: string;
  excerpt: string;
  tags: string[];
  featureImage: string | null;
  featureImageAlt: string | null;
  sourceUrl: string;
}

export interface PollResponse {
  requireVoterName: boolean;
  title: string;
  closesAt: string;
  hasVoted: boolean;
  options: PollOption[];
}

export interface UpdatePollChoicesRequest {
  optionPostIds: string[];
}

export interface UpdatePollChoicesResponse {
  updated: true;
  optionCount: number;
}

export interface CastVoteRequest {
  voterName?: string;
  optionIds: string[];
  turnstileToken?: string;
}

export interface CastVoteResponse {
  accepted: true;
  message: string;
}

export interface PollResultOption extends PollOption {
  votes: number;
  percentage: number;
}

export interface PollResultsResponse {
  voters: PollResultVoter[];
  title: string;
  closesAt: string;
  expiresAt: string;
  totalVotes: number;
  options: PollResultOption[];
}

export interface PollResultVoter {
  name: string | null;
  optionIds: string[];
}

export interface ApiErrorResponse {
  statusCode: number;
  code: string;
  message: string;
  retryAfterSeconds?: number;
}

/** Add the calendar-month limit in UTC, clamping to the last day of the month. */
export function getMaxPollEndDate(now: Date): Date {
  const maximum = new Date(now);
  const day = maximum.getUTCDate();
  maximum.setUTCDate(1);
  maximum.setUTCMonth(maximum.getUTCMonth() + POLL_LIMITS.maxDurationMonths);
  const lastDay = new Date(
    Date.UTC(maximum.getUTCFullYear(), maximum.getUTCMonth() + 1, 0),
  ).getUTCDate();
  maximum.setUTCDate(Math.min(day, lastDay));
  return maximum;
}
