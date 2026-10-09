import { afterEach, expect, it, vi } from 'vitest';
import { execute } from './commands.js';
import { GameClient } from './client.js';
import { agentSchemaVersion } from './protocol.js';

afterEach(() => vi.restoreAllMocks());

const character = 'm7Qp2_aR9L-x';
const recipient = 'aB3dE6gH9jK2';
const accepted = {
  ok: true,
  schema_version: agentSchemaVersion,
  server_time: '2026-10-09T00:00:00.000Z',
  data: {},
} as const;

it('sends items and gold as one gift with a generated request ID', async () => {
  const invoke = vi
    .spyOn(GameClient.prototype, 'invoke')
    .mockResolvedValue(structuredClone(accepted));
  await execute(
    [
      'gift-send',
      '-c',
      character,
      '--to',
      recipient,
      '--items',
      '[{"item_id":"ore","quantity":10}]',
      '--gold',
      '120',
    ],
    vi.fn(),
  );
  expect(invoke.mock.calls[0]![0]).toBe('character/gifts/send');
  const body = invoke.mock.calls[0]![1] as Record<string, unknown>;
  expect(body).toMatchObject({
    character_id: character,
    recipient_character_id: recipient,
    items: [{ item_id: 'ore', quantity: 10 }],
    gold: 120,
  });
  expect(body.request_id).toMatch(/^[0-9a-f-]{36}$/);
});

it('sends gold alone, and lists and claims without a town', async () => {
  const invoke = vi
    .spyOn(GameClient.prototype, 'invoke')
    .mockResolvedValue(structuredClone(accepted));
  await execute(
    ['gift-send', '-c', character, '--to', recipient, '--gold', '5'],
    vi.fn(),
  );
  expect(invoke.mock.calls[0]![1]).not.toHaveProperty('items');
  await execute(['gifts', '-c', character, '--cursor', '7'], vi.fn());
  expect(invoke.mock.calls[1]).toEqual([
    'character/gifts',
    { character_id: character, cursor: 7 },
  ]);
  await execute(['gift-claim', '-c', character], vi.fn());
  expect(invoke.mock.calls[2]).toEqual([
    'character/gifts/claim',
    { character_id: character },
  ]);
});
