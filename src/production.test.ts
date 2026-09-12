import { afterEach, expect, it, vi } from 'vitest';
import { GameClient } from './client.js';
import { execute, repeatActivity } from './commands.js';
import { CliError } from './errors.js';
import { agentGameResponseSchema, type AgentGameResponse } from './protocol.js';
import { buySchema, shopViewSchema } from './protocol/production.js';

it('accepts purchasable weapons in shop responses and purchase inputs', () => {
  for (const item_id of [
    'iron_sword',
    'iron_dagger',
    'oak_staff',
    'iron_mace',
    'wooden_lyre',
  ]) {
    expect(
      shopViewSchema.safeParse({
        location: { id: 'dolgan', name: 'Dolgan', kind: 'town' },
        offers: [
          {
            item_id,
            name: item_id,
            price: 10,
            quantity: 1,
            recovery_seconds: 60,
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      buySchema.safeParse({
        character_id: 'Miner',
        item_id,
        max_payment: 10,
        request_id: '11111111-1111-4111-8111-111111111111',
      }).success,
    ).toBe(true);
  }
});

vi.mock('node:timers/promises', () => ({
  setTimeout: () => Promise.resolve(),
}));
afterEach(() => vi.restoreAllMocks());

function result(
  reason: 'COMPLETED' | 'RESOURCE_DEPLETED' = 'COMPLETED',
): AgentGameResponse {
  return {
    ok: true,
    schema_version: '2.0',
    locale: 'en',
    server_time: '2026-09-09T00:00:45.000Z',
    user_content: [],
    data: {
      activity: {
        activity_id: '11111111-1111-4111-8111-111111111111',
        kind: 'gather',
        resource_id: 'mossway_herb',
        location: { id: 'mossway', name: 'Mossway', kind: 'field' },
        started_at: '2026-09-09T00:00:00.000Z',
        completes_at: '2026-09-09T00:00:45.000Z',
        duration_seconds: 45,
        output: {
          item_id: 'herb',
          name: 'Wolf Mint',
          quantity: 1,
          unit_weight: 1,
        },
        status: 'ENDED',
        ended_at: '2026-09-09T00:00:45.000Z',
        end_reason: reason,
        produced_quantity: reason === 'COMPLETED' ? 1 : 0,
      },
    },
  };
}
const args = ['gather', '-c', 'Maker', '--item', 'herb'];

it('accepts counts above five without sending the repetition count to the API', async () => {
  const invoke = vi
    .spyOn(GameClient.prototype, 'invoke')
    .mockResolvedValue(result());
  expect(await execute([...args, '--count', '100'], vi.fn())).toMatchObject({
    ok: true,
    repetition: {
      requested_count: 100,
      completed_count: 100,
      produced: { herb: 100 },
    },
  });
  expect(invoke).toHaveBeenCalledTimes(100);
  expect(invoke).toHaveBeenLastCalledWith('character/gather', {
    character_id: 'Maker',
    item_id: 'herb',
  });
});

it('rejects location arguments before starting an activity', async () => {
  const invoke = vi.spyOn(GameClient.prototype, 'invoke');
  await expect(
    execute([...args, '--location', 'mossway'], vi.fn()),
  ).rejects.toMatchObject({ code: 'INVALID_ARGUMENTS' });
  expect(invoke).not.toHaveBeenCalled();
});

it('rejects invalid counts before starting an activity', async () => {
  const invoke = vi.spyOn(GameClient.prototype, 'invoke');
  for (const count of [
    '0',
    '-1',
    '1.5',
    'NaN',
    'Infinity',
    '9007199254740992',
  ]) {
    await expect(
      execute([...args, '--count', count], vi.fn()),
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENTS' });
  }
  expect(invoke).not.toHaveBeenCalled();
});

it('waits for each accepted result before starting the next and stops on depletion', async () => {
  const completed = result();
  const running = agentGameResponseSchema.parse({
    ...completed,
    next_poll_after_seconds: 1,
    data: {
      activity: {
        ...completed.data.activity!,
        status: 'RUNNING',
        ended_at: null,
        end_reason: null,
        produced_quantity: 0,
      },
    },
  });
  const invoke = vi
    .spyOn(GameClient.prototype, 'invoke')
    .mockResolvedValueOnce(running)
    .mockResolvedValueOnce(completed)
    .mockResolvedValueOnce(running)
    .mockResolvedValueOnce(result('RESOURCE_DEPLETED'));
  const response = await execute([...args, '--count', '6'], vi.fn());
  expect(response).toMatchObject({
    ok: false,
    repetition: {
      requested_count: 6,
      completed_count: 1,
      produced: { herb: 1 },
    },
  });
  expect(invoke.mock.calls.map((call) => call[0])).toEqual([
    'character/gather',
    'character/activity',
    'character/gather',
    'character/activity',
  ]);
});

it('preserves confirmed output on an uncertain later start without retrying it', async () => {
  const invoke = vi
    .spyOn(GameClient.prototype, 'invoke')
    .mockResolvedValueOnce(result())
    .mockRejectedValueOnce(new CliError('NETWORK_ERROR'));
  await expect(
    repeatActivity(
      new GameClient('https://example.com'),
      'character/gather',
      {},
      { character: 'Maker' },
      6,
    ),
  ).rejects.toMatchObject({
    code: 'NETWORK_ERROR',
    detail: {
      repetition: {
        requested_count: 6,
        completed_count: 1,
        produced: { herb: 1 },
      },
    },
  });
  expect(invoke).toHaveBeenCalledTimes(2);
});

it('keeps response diagnostics and the accepted activity when a repetition cannot read its result', async () => {
  const completed = result();
  const running = agentGameResponseSchema.parse({
    ...completed,
    next_poll_after_seconds: 45,
    data: {
      activity: {
        ...completed.data.activity,
        status: 'RUNNING',
        ended_at: null,
        end_reason: null,
        produced_quantity: 0,
      },
    },
  });
  const invoke = vi
    .spyOn(GameClient.prototype, 'invoke')
    .mockResolvedValueOnce(running)
    .mockRejectedValueOnce(
      new CliError('UPDATE_REQUIRED', {
        reason: 'invalid_response',
        operation: 'character/activity',
        http_status: 200,
        fields: ['data.activity'],
      }),
    );
  await expect(
    execute([...args, '--count', '3'], vi.fn()),
  ).rejects.toMatchObject({
    code: 'UPDATE_REQUIRED',
    detail: {
      reason: 'invalid_response',
      operation: 'character/activity',
      http_status: 200,
      fields: ['data.activity'],
      activity_id: running.data.activity!.activity_id,
      repetition: { requested_count: 3, completed_count: 0, produced: {} },
    },
  });
  expect(invoke.mock.calls.map(([path]) => path)).toEqual([
    'character/gather',
    'character/activity',
  ]);
});

it('rejects purchase limits above the server storage range before sending', async () => {
  const invoke = vi.spyOn(GameClient.prototype, 'invoke');
  await expect(
    execute(
      [
        'buy',
        '-c',
        'Maker',
        '--item',
        'basic_pickaxe',
        '--max-payment',
        '2147483648',
      ],
      vi.fn(),
    ),
  ).rejects.toMatchObject({ code: 'INVALID_ARGUMENTS' });
  expect(invoke).not.toHaveBeenCalled();
});

it('retains a generated purchase ID and payment arguments when the reply is lost', async () => {
  const invoke = vi
    .spyOn(GameClient.prototype, 'invoke')
    .mockRejectedValue(new CliError('NETWORK_ERROR'));
  await expect(
    execute(
      ['buy', '-c', 'Maker', '--item', 'basic_pickaxe', '--max-payment', '10'],
      vi.fn(),
    ),
  ).rejects.toMatchObject({
    code: 'NETWORK_ERROR',
    detail: {
      request_id: expect.any(String),
      item_id: 'basic_pickaxe',
      max_payment: 10,
    },
  });
  expect(invoke).toHaveBeenCalledTimes(1);
});
