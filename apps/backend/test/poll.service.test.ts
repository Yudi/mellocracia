import { describe, expect, test } from 'bun:test';
import type { CatalogItem } from '@mellocracia/contracts';
import { CatalogService } from '../src/app/catalog/catalog.service';
import { AppConfig } from '../src/app/config/app-config';
import {
  PollRepository,
  type CreatePollRecord,
} from '../src/app/polls/poll.repository';
import { PollService } from '../src/app/polls/poll.service';
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
): PollService {
  const repository = {
    create: async (record: CreatePollRecord) => onCreate(record),
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
});
