import { afterEach, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { GameClient } from './client.js';
import { execute } from './commands.js';
import {
  agentGameResponseSchema,
  sendChatSchema,
  sendDirectMessageSchema,
} from './protocol.js';

vi.mock('node:fs/promises', () => ({ readFile: vi.fn() }));
afterEach(() => vi.restoreAllMocks());
const result = {
  ok: true,
  schema_version: '3.2',
  server_time: '2026-09-12T00:00:00.000Z',
  data: {},
} as const;
const traveler = 'Traveler0000';
const friend = 'Friend000000';

it('maps communication flags and rejects removed regional flags and invalid limits before sending', async () => {
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
  invoke.mockClear();
  for (const flags of [
    ['--region', 'selene'],
    ['--limit', '51'],
    ['--limit', '0'],
    ['--before', '1.5'],
  ]) {
    await expect(
      execute(['chat', '-c', traveler, ...flags], vi.fn()),
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENTS' });
  }
  expect(invoke).not.toHaveBeenCalled();
});

it('validates code-point limits and rejects unknown send fields', () => {
  for (const [schema, maximum, extra] of [
    [sendChatSchema, 400, {}],
    [sendDirectMessageSchema, 1000, { recipient_character_id: friend }],
  ] as const) {
    const body = {
      character_id: traveler,
      language: 'en',
      text: '🧙'.repeat(maximum),
      ...extra,
    };
    expect(schema.safeParse(body).success).toBe(true);
    for (const text of ['🧙'.repeat(maximum + 1), '\u0000', '\ud800', '   ']) {
      expect(schema.safeParse({ ...body, text }).success).toBe(false);
    }
    for (const removed of [
      { request_id: '11111111-1111-4111-8111-111111111111' },
      { region_id: 'selene' },
      { in_reply_to: '11111111-1111-4111-8111-111111111111' },
    ]) {
      expect(schema.safeParse({ ...body, ...removed }).success).toBe(false);
    }
  }
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

it('retains attention, message bodies, read state and conversation direction during response validation', () => {
  const message = {
    message_id: '11111111-1111-4111-8111-111111111111',
    number: 1,
    sender_character_id: friend,
    sender_discriminator: '0002',
    recipient_character_id: traveler,
    recipient_discriminator: '0001',
    created_at: result.server_time,
    language: 'en',
    read_at: null,
    user_content: {
      sender_name: 'Friend',
      recipient_name: 'Traveler',
      text: 'Hello',
    },
  };
  const response = {
    ...result,
    attention: {
      unread_direct_messages: 1,
      chat: { channel_id: 'selene', new_messages: 3 },
    },
    data: {
      direct_messages: {
        messages: [message],
        conversations: [
          {
            character_id: friend,
            discriminator: '0002',
            last_direction: 'received',
            last_message_at: result.server_time,
            user_content: { name: 'Friend' },
          },
        ],
        next_cursor: null,
      },
    },
  };
  expect(agentGameResponseSchema.parse(response)).toEqual(response);
  expect(
    agentGameResponseSchema.safeParse({
      ...response,
      attention: { ...response.attention, unread_direct_messages: -1 },
    }).success,
  ).toBe(false);
});
