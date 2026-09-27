import { expect, test } from 'bun:test';
import { PollRepository } from '../src/app/polls/poll.repository';
import type { DatabaseService } from '../src/app/database/database.service';

test('results group multiple selections without merging names or exposing voter hashes', async () => {
  const repository = new PollRepository({
    prisma: {
      poll: {
        findFirst: async () => ({
          title: 'Mesa',
          closesAt: new Date(),
          expiresAt: new Date(),
          totalVotes: 4,
          options: [
            { postId: 'a', title: 'A', voteCount: 4 },
            { postId: 'b', title: 'B', voteCount: 1 },
          ],
          votes: [
            { voterNonceHash: 'one', voterName: 'Ana', optionPostId: 'a' },
            { voterNonceHash: 'one', voterName: 'Ana', optionPostId: 'b' },
            { voterNonceHash: 'two', voterName: 'Ana', optionPostId: 'a' },
            { voterNonceHash: 'three', voterName: null, optionPostId: 'a' },
            { voterNonceHash: 'four', voterName: null, optionPostId: 'a' },
          ],
        }),
      },
    },
  } as unknown as DatabaseService);
  const result = await repository.findResults('share-hash');
  expect(result?.voters).toEqual([
    { name: 'Ana', optionIds: ['a', 'b'] },
    { name: 'Ana', optionIds: ['a'] },
    { name: null, optionIds: ['a'] },
    { name: null, optionIds: ['a'] },
  ]);
  expect(
    result?.options.map(({ votes, percentage }) => ({ votes, percentage })),
  ).toEqual([
    { votes: 4, percentage: 100 },
    { votes: 1, percentage: 25 },
  ]);
});
