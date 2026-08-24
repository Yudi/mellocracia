import type {
  ApiErrorResponse,
  CastVoteRequest,
  CastVoteResponse,
  CatalogResponse,
  CreatePollRequest,
  CreatePollResponse,
  PollResponse,
  PollResultsResponse,
  UpdatePollChoicesRequest,
  UpdatePollChoicesResponse,
} from '@mellocracia/contracts';

const configuredBaseUrl = import.meta.env.PUBLIC_API_BASE_URL;
const API_BASE_URL = (configuredBaseUrl || '/api').replace(/\/$/, '');

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryAfterSeconds?: number;

  constructor(
    message: string,
    status: number,
    code = 'UNKNOWN_ERROR',
    retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      cache: 'no-store',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiClientError(
      'Não foi possível alcançar o servidor. Confira sua conexão e tente novamente.',
      0,
      'NETWORK_ERROR',
    );
  }

  if (!response.ok) {
    let payload: Partial<ApiErrorResponse> = {};

    try {
      payload = (await response.json()) as Partial<ApiErrorResponse>;
    } catch {
      // Some edge proxies return an empty response for a throttled request.
    }

    throw new ApiClientError(
      payload.message ||
        (response.status === 429
          ? 'Muitas tentativas em pouco tempo. Espere um pouco e tente novamente.'
          : 'Não foi possível concluir esta ação.'),
      response.status,
      payload.code ||
        (response.status === 429 ? 'RATE_LIMITED' : 'REQUEST_FAILED'),
      payload.retryAfterSeconds,
    );
  }

  return (await response.json()) as T;
}

export const api = {
  getCatalog(): Promise<CatalogResponse> {
    return request<CatalogResponse>('/catalog');
  },

  createPoll(payload: CreatePollRequest): Promise<CreatePollResponse> {
    return request<CreatePollResponse>('/polls', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  getPoll(token: string): Promise<PollResponse> {
    return request<PollResponse>(`/polls/${encodeURIComponent(token)}`);
  },

  getPollForEdit(token: string): Promise<PollResponse> {
    return request<PollResponse>(`/polls/edit/${encodeURIComponent(token)}`);
  },

  updatePollChoices(
    token: string,
    payload: UpdatePollChoicesRequest,
  ): Promise<UpdatePollChoicesResponse> {
    return request<UpdatePollChoicesResponse>(
      `/polls/edit/${encodeURIComponent(token)}`,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      },
    );
  },

  castVote(token: string, payload: CastVoteRequest): Promise<CastVoteResponse> {
    return request<CastVoteResponse>(
      `/polls/${encodeURIComponent(token)}/votes`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  },

  getResults(token: string): Promise<PollResultsResponse> {
    return request<PollResultsResponse>(
      `/results/${encodeURIComponent(token)}`,
    );
  },
};

export function isExpiredError(error: unknown): boolean {
  return (
    error instanceof ApiClientError &&
    ['POLL_EXPIRED', 'EXPIRED'].includes(error.code)
  );
}

export function isDuplicateVoteError(error: unknown): boolean {
  return (
    error instanceof ApiClientError &&
    ['DUPLICATE_VOTE', 'ALREADY_VOTED', 'VOTE_ALREADY_CAST'].includes(
      error.code,
    )
  );
}

export function isRateLimitError(error: unknown): boolean {
  return (
    error instanceof ApiClientError &&
    (error.status === 429 || error.code === 'RATE_LIMITED')
  );
}

export function describeApiError(error: unknown, fallback: string): string {
  return error instanceof ApiClientError ? error.message : fallback;
}
