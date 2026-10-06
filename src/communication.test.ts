import { afterEach, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { GameClient } from './client.js';
import { execute } from './commands.js';
import { agentSchemaVersion } from './protocol.js';

vi.mock('node:fs/promises', () => ({ readFile: vi.fn() }));
afterEach(() => vi.restoreAllMocks());
const result = {
  ok: true,
  schema_version: agentSchemaVersion,
  server_time: '2026-09-12T00:00:00.000Z',
  data: {},
} as const;
const traveler = 'Traveler0000';
const friend = 'Friend000000';

it('maps communication flags', async () => {
  const invoke = vi
    .spyOn(GameClient.prototype, 'invoke')
    .mockResolvedValue({ ...result });
  await execute(
    ['chat', '-c', traveler, '--after', '10', '--limit', '50'],
    vi.fn(),
  );
  expect(invoke).toHaveBeenLastCalledWith('character/chat', {
    character_id: traveler,
    after: 10,
    limit: 50,
  });
  await execute(
    ['dm', '-c', traveler, '--with', friend, '--unread-only', '--limit', '1'],
    vi.fn(),
  );
  expect(invoke).toHaveBeenLastCalledWith('character/direct-messages', {
    character_id: traveler,
    with_character_id: friend,
    unread_only: true,
    limit: 1,
  });
  await execute(
    ['dm-conversations', '-c', traveler, '--before', '40', '--limit', '5'],
    vi.fn(),
  );
  expect(invoke).toHaveBeenLastCalledWith(
    'character/direct-messages/conversations',
    { character_id: traveler, before: 40, limit: 5 },
  );
  await execute(
    ['news', '-c', traveler, '--before', '12', '--limit', '3'],
    vi.fn(),
  );
  expect(invoke).toHaveBeenLastCalledWith('character/news', {
    character_id: traveler,
    before: 12,
    limit: 3,
  });
  await execute(['news-article', '-c', traveler, '--article', '7'], vi.fn());
  expect(invoke).toHaveBeenLastCalledWith('character/news/article', {
    character_id: traveler,
    number: 7,
  });
  await execute(['search-characters', '--name', 'El', '--limit', '5'], vi.fn());
  expect(invoke).toHaveBeenLastCalledWith('characters/search', {
    name: 'El',
    limit: 5,
  });
  await execute(
    ['search-characters', '--name', 'Elwen', '--discriminator', '0427'],
    vi.fn(),
  );
  expect(invoke).toHaveBeenLastCalledWith('characters/search', {
    name: 'Elwen',
    discriminator: '0427',
  });
});

it('sends identical text twice as two explicit calls without adding request IDs', async () => {
  const invoke = vi
    .spyOn(GameClient.prototype, 'invoke')
    .mockResolvedValue({ ...result });
  const body = {
    recipient_character_id: friend,
    text: 'Hello',
    language: 'en',
  };
  vi.mocked(readFile).mockResolvedValue(JSON.stringify(body));
  for (let count = 0; count < 2; count++)
    await execute(['dm-send', '-c', traveler, '-i', 'message.json'], vi.fn());
  expect(invoke.mock.calls).toEqual(
    Array.from({ length: 2 }, () => [
      'character/direct-messages/send',
      { ...body, character_id: traveler },
    ]),
  );
});
