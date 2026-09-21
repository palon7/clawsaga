import { afterEach, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { GameClient } from './client.js';
import { execute } from './commands.js';
import {
  agentSchemaVersion,
  createBoardThreadSchema,
  replyBoardThreadSchema,
} from './protocol.js';

vi.mock('node:fs/promises', () => ({ readFile: vi.fn() }));
afterEach(() => vi.restoreAllMocks());

const result = {
  ok: true,
  schema_version: agentSchemaVersion,
  server_time: '2026-09-20T00:00:00.000Z',
  data: {},
} as const;
const traveler = 'Traveler0000';
const thread = '11111111-1111-4111-8111-111111111111';

it('maps Community Board flags and cursors to the board requests', async () => {
  const invoke = vi.spyOn(GameClient.prototype, 'invoke').mockResolvedValue({
    ...result,
  });
  await execute(
    [
      'board',
      '-c',
      traveler,
      '--category',
      'help',
      '--thread-language',
      'en',
      '--authored-by-self',
      '--participated-by-self',
      '--unread-only',
      '--query',
      'coal',
      '--before-thread',
      thread,
      '--limit',
      '10',
    ],
    vi.fn(),
  );
  expect(invoke).toHaveBeenLastCalledWith('character/board', {
    character_id: traveler,
    category: 'help',
    language: 'en',
    authored_by_self: true,
    participated_by_self: true,
    unread_only: true,
    query: 'coal',
    before: thread,
    limit: 10,
  });

  await execute(
    ['board-thread', '-c', traveler, '--thread', thread, '--after', '7'],
    vi.fn(),
  );
  expect(invoke).toHaveBeenLastCalledWith('character/board/thread', {
    character_id: traveler,
    thread_id: thread,
    after: 7,
  });
});

it('accepts a maximum body from an input file and rejects one code point more', async () => {
  const invoke = vi
    .spyOn(GameClient.prototype, 'invoke')
    .mockResolvedValue({ ...result });
  const body = '🧙'.repeat(10_000);
  vi.mocked(readFile).mockResolvedValue(
    JSON.stringify({ category: 'lore', title: 'Worst case', body }),
  );
  await execute(['board-create', '-c', traveler, '-i', 'body.json'], vi.fn());
  expect(invoke).toHaveBeenLastCalledWith('character/board/create', {
    character_id: traveler,
    category: 'lore',
    title: 'Worst case',
    body,
  });

  vi.mocked(readFile).mockResolvedValue(
    JSON.stringify({
      category: 'lore',
      title: 'Too long',
      body: `${body}🧙`,
    }),
  );
  await expect(
    execute(['board-create', '-c', traveler, '-i', 'body.json'], vi.fn()),
  ).rejects.toMatchObject({ code: 'INVALID_ARGUMENTS' });

  for (const [schema, maximum, extra] of [
    [createBoardThreadSchema, 10_000, { category: 'general', title: 'T' }],
    [replyBoardThreadSchema, 5_000, { thread_id: thread }],
  ] as const) {
    expect(
      schema.safeParse({
        character_id: traveler,
        body: '🧙'.repeat(maximum),
        ...extra,
      }).success,
    ).toBe(true);
    expect(
      schema.safeParse({
        character_id: traveler,
        body: '🧙'.repeat(maximum + 1),
        ...extra,
      }).success,
    ).toBe(false);
  }
});
