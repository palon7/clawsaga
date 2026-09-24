import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { execute } from './commands.js';
import { GameClient } from './client.js';
import { CliError } from './errors.js';
import { agentGameResponseSchema } from './protocol.js';

beforeEach(() =>
  vi.stubGlobal('fetch', () => Promise.reject(new Error('offline'))),
);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const character = 'm7Qp2_aR9L-x';
const instance = '22222222-2222-4222-8222-222222222222';
const transfer = {
  ok: true,
  schema_version: '3.7',
  server_time: '2026-09-20T00:00:00.000Z',
  data: {
    storage: {
      town: { id: 'selene', name: 'Selene', kind: 'town' },
      items: [],
      capacity: { stored_weight: 10, maximum_weight: 500 },
    },
    transfer: {
      request_id: '33333333-3333-4333-8333-333333333333',
      direction: 'deposit',
      town_id: 'selene',
      items: [
        {
          kind: 'stack',
          item_id: 'ore',
          quality: 'standard',
          quantity: 10,
        },
      ],
    },
  },
} as const;
const batch = JSON.stringify([
  { kind: 'stack', item_id: 'ore', quality: 'standard', quantity: 10 },
  { kind: 'individual', instance_id: instance },
]);

it('sends the whole storage batch as one request and generates a request ID', async () => {
  const invoke = vi
    .spyOn(GameClient.prototype, 'invoke')
    .mockResolvedValue(structuredClone(transfer) as never);
  const result = await execute(
    ['deposit', '-c', character, '--town', 'selene', '--items', batch],
    vi.fn(),
  );
  expect(invoke).toHaveBeenCalledTimes(1);
  const body = invoke.mock.calls[0]![1] as Record<string, unknown>;
  expect(invoke.mock.calls[0]![0]).toBe('character/storage/deposit');
  expect(body).toMatchObject({
    character_id: character,
    town_id: 'selene',
    items: [
      { kind: 'stack', item_id: 'ore', quality: 'standard', quantity: 10 },
      { kind: 'individual', instance_id: instance },
    ],
  });
  expect(body.request_id).toMatch(/^[0-9a-f-]{36}$/);
  expect(agentGameResponseSchema.parse(result)).toEqual(result);
});

it('keeps a supplied request ID and the withdrawal path', async () => {
  const invoke = vi
    .spyOn(GameClient.prototype, 'invoke')
    .mockResolvedValue(structuredClone(transfer) as never);
  const request = '44444444-4444-4444-8444-444444444444';
  await execute(
    [
      'withdraw',
      '-c',
      character,
      '--town',
      'dolgan',
      '--items',
      batch,
      '--request',
      request,
    ],
    vi.fn(),
  );
  expect(invoke.mock.calls[0]![0]).toBe('character/storage/withdraw');
  expect(invoke.mock.calls[0]![1]).toMatchObject({
    request_id: request,
    town_id: 'dolgan',
  });
});

it('retains the request ID in an uncertain-result error and rejects a malformed batch', async () => {
  const invoke = vi
    .spyOn(GameClient.prototype, 'invoke')
    .mockRejectedValue(
      new CliError('SERVICE_UNAVAILABLE', { outcome: 'unknown' }),
    );
  await expect(
    execute(
      ['deposit', '-c', character, '--town', 'selene', '--items', batch],
      vi.fn(),
    ),
  ).rejects.toMatchObject({
    code: 'SERVICE_UNAVAILABLE',
    detail: { request_id: expect.any(String), town_id: 'selene' },
  });
  invoke.mockClear();
  await expect(
    execute(
      ['deposit', '-c', character, '--town', 'selene', '--items', '{not json'],
      vi.fn(),
    ),
  ).rejects.toMatchObject({ code: 'INVALID_ARGUMENTS' });
  expect(invoke).not.toHaveBeenCalled();
});

it('reads one town and searches across towns', async () => {
  const invoke = vi
    .spyOn(GameClient.prototype, 'invoke')
    .mockResolvedValue(structuredClone(transfer) as never);
  await execute(['storage', '-c', character, '--town', 'selene'], vi.fn());
  expect(invoke.mock.calls[0]![0]).toBe('character/storage');
  expect(invoke.mock.calls[0]![1]).toMatchObject({ town_id: 'selene' });
  await execute(
    ['search-storage', '-c', character, '--query', 'Iron Ore'],
    vi.fn(),
  );
  expect(invoke.mock.calls[1]![0]).toBe('character/storage/search');
  expect(invoke.mock.calls[1]![1]).toMatchObject({ query: 'Iron Ore' });
});
