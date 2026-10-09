import { afterEach, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { GameClient } from './client.js';
import { execute } from './commands.js';
import {
  agentSchemaVersion,
  endSessionSchema,
  writeJournalSchema,
} from './protocol.js';
import { CliError } from './errors.js';

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

it('generates a journal request ID unless the body file or --request supplies one', async () => {
  const invoke = vi
    .spyOn(GameClient.prototype, 'invoke')
    .mockResolvedValue({ ...result });
  const body = { text: 'Back from the forest.', language: 'en' };
  vi.mocked(readFile).mockResolvedValue(JSON.stringify(body));
  await execute(['journal-write', '-c', traveler, '-i', 'entry.json'], vi.fn());
  expect(invoke.mock.calls[0]![1]).toMatchObject({
    ...body,
    request_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
  });

  const retry = '44444444-4444-4444-8444-444444444444';
  await execute(
    ['journal-write', '-c', traveler, '-i', 'entry.json', '--request', retry],
    vi.fn(),
  );
  expect(invoke.mock.calls[1]![1]).toMatchObject({ request_id: retry });

  const saved = '55555555-5555-4555-8555-555555555555';
  vi.mocked(readFile).mockResolvedValue(
    JSON.stringify({ ...body, request_id: saved }),
  );
  await execute(['journal-write', '-c', traveler, '-i', 'entry.json'], vi.fn());
  expect(invoke.mock.calls[2]![1]).toMatchObject({ request_id: saved });
});

it.each(['journal-write', 'end'])(
  'reports the sent request ID after an uncertain %s and reuses it on retry',
  async (command) => {
    const invoke = vi
      .spyOn(GameClient.prototype, 'invoke')
      .mockRejectedValueOnce(new CliError('NETWORK_ERROR'))
      .mockResolvedValue({ ...result });
    vi.mocked(readFile).mockResolvedValue(
      JSON.stringify({
        text: 'Back from the forest.',
        language: 'en',
        ...(command === 'end' ? { activity_policy: 'continue' } : {}),
      }),
    );
    const args = [command, '-c', traveler, '-i', 'entry.json'];
    const failure = await execute(args, vi.fn()).catch(
      (error: CliError) => error,
    );
    const schema = command === 'end' ? endSessionSchema : writeJournalSchema;
    const sent = schema.parse(invoke.mock.calls[0]![1]);
    expect(failure).toMatchObject({
      code: 'NETWORK_ERROR',
      detail: { request_id: sent.request_id },
    });
    await execute([...args, '--request', String(sent.request_id)], vi.fn());
    expect(invoke.mock.calls[1]).toEqual(invoke.mock.calls[0]);
  },
);
