import { describe, expect, test } from 'bun:test';
import type { CatalogItem } from '@mellocracia/contracts';
import { CatalogService } from '../src/app/catalog/catalog.service';
import { AppConfig } from '../src/app/config/app-config';
import {
  PollRepository,
  type CreatePollRecord,
  type PollRecord,
} from '../src/app/polls/poll.repository';
import { PollService } from '../src/app/polls/poll.service';
import { createOpaqueToken, hashSecret } from '../src/app/security/crypto.util';
import { RateLimitService } from '../src/app/security/rate-limit.service';
import { TurnstileService } from '../src/app/security/turnstile.service';

const posts: CatalogItem[] = [
  {
    id: 'new-post',
    slug: 'new-post',
    title: 'Novo post',
    excerpt: 'Não deve deslocar as escolhas existentes.',
    tags: ['Novidade'],
    featureImage: null,
    featureImageAlt: null,
    publishedAt: '2026-08-23T12:00:00.000Z',
    url: 'https://mello.yudi.com.br/new-post/',
  },
  {
    id: 'first-post',
    slug: 'first-post',
    title: 'Primeiro post',
    excerpt: 'Resumo antigo.',
    tags: ['Estratégia'],
    featureImage: null,
    featureImageAlt: null,
    publishedAt: '2026-08-22T12:00:00.000Z',
    url: 'https://mello.yudi.com.br/first-post/',
  },
  {
    id: 'second-post',
    slug: 'second-post',
    title: 'Segundo post',
    excerpt: 'Outro resumo.',
    tags: ['Cooperativo', 'Família'],
    featureImage: null,
    featureImageAlt: null,
    publishedAt: '2026-08-21T12:00:00.000Z',
    url: 'https://mello.yudi.com.br/second-post/',
  },
];

function createService(
  onCreate: (record: CreatePollRecord) => void,
  repositoryOverrides: Record<string, unknown> = {},
): PollService {
  const repository = {
    create: async (record: CreatePollRecord) => onCreate(record),
    ...repositoryOverrides,
  } as unknown as PollRepository;
  const catalog = {
    getFreshOrStaleCatalog: async () => ({
      items: posts,
      fetchedAt: '2026-08-23T12:00:00.000Z',
      stale: false,
    }),
  } as unknown as CatalogService;
  const config = {
    maxPollOptions: 1_000,
    tokenHashSecret: 'poll-service-test-secret',
    publicOrigin: 'https://vote.example',
    votePathPrefix: '/p',
    resultsPathPrefix: '/r',
    editPathPrefix: '/e',
  } as AppConfig;
  const rateLimit = {
    enforceCreate: async () => undefined,
  } as RateLimitService;
  const turnstile = { verify: async () => undefined } as TurnstileService;

  return new PollService(repository, catalog, config, rateLimit, turnstile);
}

describe('PollService', () => {
  test('snapshots selected post IDs, order, and tags instead of catalog positions', async () => {
    let created: CreatePollRecord | undefined;
    const service = createService((record) => {
      created = record;
    });

    await service.createPoll(
      {
        title: 'Próxima mesa',
        durationHours: 24,
        optionPostIds: ['second-post', 'first-post'],
      },
      'ip-hash',
    );

    expect(created?.options.map((option) => option.id)).toEqual([
      'second-post',
      'first-post',
    ]);
    expect(created?.options.map((option) => option.tags)).toEqual([
      ['Cooperativo', 'Família'],
      ['Estratégia'],
    ]);
  });

  test('uses the vote token for the results URL', async () => {
    const service = createService(() => undefined);

    const response = await service.createPoll(
      {
        title: 'Próxima mesa',
        durationHours: 24,
        optionPostIds: ['first-post', 'second-post'],
      },
      'ip-hash',
    );

    expect(response.resultsUrl.replace('/r/', '/p/')).toBe(response.voteUrl);
  });

  test('creates a distinct, hashed edit capability', async () => {
    let created: CreatePollRecord | undefined;
    const service = createService((record) => {
      created = record;
    });

    const response = await service.createPoll(
      {
        title: 'Próxima mesa',
        durationHours: 24,
        optionPostIds: ['first-post', 'second-post'],
      },
      'ip-hash',
    );

    const editToken = response.editUrl.split('/').at(-1);
    expect(editToken).toBeDefined();
    expect(response.editUrl).toStartWith('https://vote.example/e/');
    expect(created?.editTokenHash).toBe(
      hashSecret(editToken as string, 'poll-service-test-secret'),
    );
  });

  test('reports whether the current voter cookie has already voted', async () => {
    const shareToken = createOpaqueToken();
    const voterNonce = createOpaqueToken();
    let receivedVoterNonceHash: string | undefined;
    const record: PollRecord = {
      id: 'poll-id',
      title: 'Próxima mesa',
      expiresAt: new Date(Date.now() + 60_000),
      totalVotes: 1,
      hasVoted: true,
      options: [
        {
          id: 'first-post',
          title: 'Primeiro post',
          excerpt: 'Resumo antigo.',
          tags: ['Estratégia'],
          featureImage: null,
          featureImageAlt: null,
          sourceUrl: 'https://mello.yudi.com.br/first-post/',
          position: 0,
          votes: 1,
        },
      ],
    };
    const service = createService(() => undefined, {
      findByShareTokenHash: async (
        shareTokenHash: string,
        voterNonceHash?: string,
      ) => {
        receivedVoterNonceHash = voterNonceHash;
        return shareTokenHash ===
          hashSecret(shareToken, 'poll-service-test-secret')
          ? record
          : undefined;
      },
    });

    await expect(
      service.getPoll(shareToken, voterNonce),
    ).resolves.toMatchObject({
      hasVoted: true,
    });
    expect(receivedVoterNonceHash).toBe(
      hashSecret(voterNonce, 'poll-service-test-secret'),
    );
  });

  test('updates choices only through the matching edit capability', async () => {
    const editToken = createOpaqueToken();
    let replacedOptions: CreatePollRecord['options'] | undefined;
    const record: PollRecord = {
      id: 'poll-id',
      title: 'Próxima mesa',
      expiresAt: new Date(Date.now() + 60_000),
      totalVotes: 0,
      hasVoted: false,
      options: [],
    };
    const service = createService(() => undefined, {
      findByEditTokenHash: async (tokenHash: string) =>
        tokenHash === hashSecret(editToken, 'poll-service-test-secret')
          ? record
          : undefined,
      replaceOptions: async (
        _pollId: string,
        options: CreatePollRecord['options'],
      ) => {
        replacedOptions = options;
        return 'updated';
      },
    });

    await expect(
      service.updatePollChoices(editToken, {
        optionPostIds: ['second-post', 'first-post'],
      }),
    ).resolves.toEqual({ updated: true, optionCount: 2 });
    expect(replacedOptions?.map((option) => option.id)).toEqual([
      'second-post',
      'first-post',
    ]);
    await expect(
      service.updatePollChoices(createOpaqueToken(), {
        optionPostIds: ['second-post', 'first-post'],
      }),
    ).rejects.toThrow('Poll not found or expired');
  });
});
