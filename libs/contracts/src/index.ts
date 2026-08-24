export const POLL_LIMITS = {
  minOptions: 2,
  maxOptions: 1_000,
  minDurationHours: 1,
  maxDurationHours: 14 * 24,
  maxTitleLength: 120,
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
  title: string;
  durationHours: number;
  optionPostIds: string[];
  turnstileToken?: string;
}

export interface CreatePollResponse {
  voteUrl: string;
  resultsUrl: string;
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
  title: string;
  expiresAt: string;
  options: PollOption[];
}

export interface CastVoteRequest {
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
  title: string;
  expiresAt: string;
  totalVotes: number;
  options: PollResultOption[];
}

export interface ApiErrorResponse {
  statusCode: number;
  code: string;
  message: string;
  retryAfterSeconds?: number;
}
