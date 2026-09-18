import { afterEach, expect, it, vi } from 'vitest';
import { agentGameResponseSchema, type AgentGameResponse } from './protocol.js';
import { GameClient } from './client.js';
import { execute, repeatActivity } from './commands.js';
import { CliError } from './errors.js';
import {
  buySchema,
  craftSchema,
  shopViewSchema,
} from './protocol/production.js';

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
        character_id: 'Miner0000000',
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

const gatherId = '11111111-1111-4111-8111-111111111111';

function running(): AgentGameResponse {
  return {
    ok: true,
    schema_version: '3.1',
    server_time: '2026-09-09T00:00:00.000Z',
    next_poll_after_seconds: 1,
    data: {
      activity: {
        kind: 'gather',
        activity_id: gatherId,
        status: 'RUNNING',
        started_at: '2026-09-09T00:00:00.000Z',
        completes_at: '2026-09-09T00:00:45.000Z',
        duration_seconds: 45,
        output: { item_id: 'herb', name: 'Wolf Mint', quantity: 1 },
      },
    },
  };
}

function completed(
  reason: 'COMPLETED' | 'RESOURCE_DEPLETED' = 'COMPLETED',
): AgentGameResponse {
  return {
    ok: true,
    schema_version: '3.1',
    server_time: '2026-09-09T00:00:45.000Z',
    data: {
      activity: null,
      last_result: {
        kind: 'gather',
        activity_id: gatherId,
        status: 'ENDED',
        end_reason: reason,
        ended_at: '2026-09-09T00:00:45.000Z',
        output: {
          item_id: 'herb',
          name: 'Wolf Mint',
          quantity: reason === 'COMPLETED' ? 1 : 0,
        },
      },
    },
  };
}
const args = ['gather', '-c', 'Maker0000000', '--item', 'herb'];

it('accepts counts above five without sending the repetition count to the API', async () => {
  const invoke = vi
    .spyOn(GameClient.prototype, 'invoke')
    .mockImplementation((path) =>
      Promise.resolve(path === 'character/activity' ? completed() : running()),
    );
  expect(await execute([...args, '--count', '100'], vi.fn())).toMatchObject({
    ok: true,
    repetition: {
      requested_count: 100,
      completed_count: 100,
      produced: { herb: 100 },
      stopped_reason: 'count_reached',
    },
  });
  expect(invoke).toHaveBeenCalledTimes(200);
  expect(invoke).toHaveBeenCalledWith('character/gather', {
    character_id: 'Maker0000000',
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
  const invoke = vi
    .spyOn(GameClient.prototype, 'invoke')
    .mockResolvedValueOnce(running())
    .mockResolvedValueOnce(completed())
    .mockResolvedValueOnce(running())
    .mockResolvedValueOnce(completed('RESOURCE_DEPLETED'));
  const response = await execute([...args, '--count', '6'], vi.fn());
  expect(response).toMatchObject({
    ok: false,
    error: {
      message: 'The repetition ended before all requested attempts completed.',
    },
    data: {
      last_result: { end_reason: 'RESOURCE_DEPLETED' },
    },
    repetition: {
      requested_count: 6,
      completed_count: 1,
      produced: { herb: 1 },
      stopped_reason: 'activity_stopped',
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
    .mockResolvedValueOnce(running())
    .mockResolvedValueOnce(completed())
    .mockRejectedValueOnce(new CliError('NETWORK_ERROR'));
  await expect(
    repeatActivity(
      new GameClient('https://example.com'),
      'character/gather',
      {},
      { character: 'Maker0000000' },
      6,
    ),
  ).rejects.toMatchObject({
    code: 'NETWORK_ERROR',
    detail: {
      repetition: {
        requested_count: 6,
        completed_count: 1,
        produced: { herb: 1 },
        stopped_reason: 'unknown',
      },
    },
  });
  expect(invoke).toHaveBeenCalledTimes(3);
});

it('keeps response diagnostics and the accepted activity when a repetition cannot read its result', async () => {
  const invoke = vi
    .spyOn(GameClient.prototype, 'invoke')
    .mockResolvedValueOnce(running())
    .mockRejectedValueOnce(
      new CliError('INVALID_RESPONSE', {
        reason: 'invalid_response',
        operation: 'character/activity',
        http_status: 200,
        fields: ['data.activity'],
      }),
    );
  await expect(
    execute([...args, '--count', '3'], vi.fn()),
  ).rejects.toMatchObject({
    code: 'INVALID_RESPONSE',
    detail: {
      reason: 'invalid_response',
      operation: 'character/activity',
      http_status: 200,
      fields: ['data.activity'],
      activity_id: gatherId,
      outcome: 'unknown',
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
        'Maker0000000',
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
      [
        'buy',
        '-c',
        'Maker0000000',
        '--item',
        'basic_pickaxe',
        '--max-payment',
        '10',
      ],
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

const craftId = '22222222-2222-4222-8222-222222222222';

function runningCraft(id = craftId): AgentGameResponse {
  return {
    ok: true,
    schema_version: '3.1',
    server_time: '2026-09-09T00:00:00.000Z',
    next_poll_after_seconds: 1,
    data: {
      activity: {
        kind: 'craft',
        activity_id: id,
        status: 'RUNNING',
        started_at: '2026-09-09T00:00:00.000Z',
        completes_at: '2026-09-09T00:02:00.000Z',
        duration_seconds: 120,
        recipe_id: 'metal_ingot',
        output: { item_id: 'metal_ingot', name: 'Iron Ingot', quantity: 1 },
      },
    },
  };
}

function completedCraft(id = craftId): AgentGameResponse {
  return {
    ok: true,
    schema_version: '3.1',
    server_time: '2026-09-09T00:02:00.000Z',
    data: {
      activity: null,
      last_result: {
        kind: 'craft',
        activity_id: id,
        status: 'ENDED',
        end_reason: 'COMPLETED',
        ended_at: '2026-09-09T00:02:00.000Z',
        recipe_id: 'metal_ingot',
        output: { item_id: 'metal_ingot', name: 'Iron Ingot', quantity: 1 },
        fee_paid: 2,
      },
    },
  };
}

it('assigns a new request ID to each craft lot without sending the count', async () => {
  const bodies: Array<Record<string, unknown>> = [];
  const invoke = vi
    .spyOn(GameClient.prototype, 'invoke')
    .mockImplementation((path, body) => {
      if (path === 'character/activity')
        return Promise.resolve(completedCraft());
      bodies.push(body as Record<string, unknown>);
      return Promise.resolve(runningCraft());
    });
  const response = await execute(
    [
      'craft',
      '-c',
      'Maker0000000',
      '--recipe',
      'metal_ingot',
      '--max-fee-per-lot',
      '2',
      '--count',
      '3',
    ],
    vi.fn(),
  );
  expect(response).toMatchObject({
    ok: true,
    repetition: {
      requested_count: 3,
      completed_count: 3,
      produced: { metal_ingot: 3 },
      stopped_reason: 'count_reached',
    },
  });
  expect(bodies).toHaveLength(3);
  expect(new Set(bodies.map((body) => body.request_id)).size).toBe(3);
  for (const body of bodies) {
    expect(body).toMatchObject({
      character_id: 'Maker0000000',
      recipe_id: 'metal_ingot',
      max_fee_per_lot: 2,
    });
    expect(body).not.toHaveProperty('count');
  }
  expect(invoke).toHaveBeenCalledTimes(6);
});

it('retries one craft lot with an explicit request ID and rejects a repeated count', async () => {
  const bodies: Array<Record<string, unknown>> = [];
  const invoke = vi
    .spyOn(GameClient.prototype, 'invoke')
    .mockImplementation((path, body) => {
      if (path === 'character/activity')
        return Promise.resolve(completedCraft());
      bodies.push(body as Record<string, unknown>);
      return Promise.resolve(runningCraft());
    });
  const request_id = '33333333-3333-4333-8333-333333333333';
  await execute(
    [
      'craft',
      '-c',
      'Maker0000000',
      '--recipe',
      'metal_ingot',
      '--max-fee-per-lot',
      '2',
      '--request',
      request_id,
    ],
    vi.fn(),
  );
  expect(bodies).toEqual([expect.objectContaining({ request_id })]);
  await expect(
    execute(
      [
        'craft',
        '-c',
        'Maker0000000',
        '--recipe',
        'metal_ingot',
        '--max-fee-per-lot',
        '2',
        '--request',
        request_id,
        '--count',
        '2',
      ],
      vi.fn(),
    ),
  ).rejects.toMatchObject({ code: 'INVALID_ARGUMENTS' });
  expect(bodies).toHaveLength(1);
  expect(invoke).toHaveBeenCalledTimes(2);
});

// The server answers a replayed request whose accepted craft already ended with
// the stored result in data.last_result and no running activity.
function replayedCraftResult(
  reason: 'COMPLETED' | 'STOPPED' = 'COMPLETED',
): AgentGameResponse {
  return {
    ok: true,
    schema_version: '3.1',
    server_time: '2026-09-09T00:03:00.000Z',
    data: {
      activity: null,
      last_result: {
        kind: 'craft',
        activity_id: craftId,
        status: 'ENDED',
        end_reason: reason,
        ended_at: '2026-09-09T00:02:00.000Z',
        recipe_id: 'metal_ingot',
        output: {
          item_id: 'metal_ingot',
          name: 'Iron Ingot',
          quantity: reason === 'COMPLETED' ? 1 : 0,
        },
        fee_paid: reason === 'COMPLETED' ? 2 : 0,
      },
      capacity: { carried_weight: 1, reserved_weight: 0, maximum_weight: 240 },
    },
  };
}

it('reads an already finished craft from a replayed request ID without waiting', async () => {
  expect(agentGameResponseSchema.safeParse(replayedCraftResult()).success).toBe(
    true,
  );
  const request_id = '55555555-5555-4555-8555-555555555555';
  const bodies: Array<Record<string, unknown>> = [];
  const invoke = vi
    .spyOn(GameClient.prototype, 'invoke')
    .mockImplementation((path, body) => {
      bodies.push(body as Record<string, unknown>);
      return Promise.resolve(replayedCraftResult());
    });
  const response = await execute(
    [
      'craft',
      '-c',
      'Maker0000000',
      '--recipe',
      'metal_ingot',
      '--max-fee-per-lot',
      '2',
      '--request',
      request_id,
    ],
    vi.fn(),
  );
  expect(response).toMatchObject({
    ok: true,
    repetition: {
      requested_count: 1,
      completed_count: 1,
      produced: { metal_ingot: 1 },
      stopped_reason: 'count_reached',
    },
  });
  expect(invoke.mock.calls.map(([path]) => path)).toEqual(['character/craft']);
  expect(bodies).toEqual([expect.objectContaining({ request_id })]);
});

function runningCraftActivity(
  id: string,
): NonNullable<AgentGameResponse['data']['activity']> {
  return {
    kind: 'craft',
    activity_id: id,
    started_at: '2026-09-09T00:03:00.000Z',
    completes_at: '2026-09-09T00:05:00.000Z',
    duration_seconds: 120,
    output: {
      item_id: 'metal_ingot',
      name: 'Iron Ingot',
      quantity: 1,
    },
    recipe_id: 'metal_ingot',
    status: 'RUNNING',
  };
}

it('recovers a replayed craft while a newer activity keeps running', async () => {
  const response = replayedCraftResult();
  response.data.activity = runningCraftActivity(
    '77777777-7777-4777-8777-777777777777',
  );
  response.next_poll_after_seconds = 30;
  expect(agentGameResponseSchema.safeParse(response).success).toBe(true);
  const invoke = vi
    .spyOn(GameClient.prototype, 'invoke')
    .mockResolvedValue(response);
  await expect(
    execute(
      [
        'craft',
        '-c',
        'Maker0000000',
        '--recipe',
        'metal_ingot',
        '--max-fee-per-lot',
        '2',
        '--request',
        '88888888-8888-4888-8888-888888888888',
      ],
      vi.fn(),
    ),
  ).resolves.toMatchObject({
    ok: true,
    repetition: {
      requested_count: 1,
      completed_count: 1,
      produced: { metal_ingot: 1 },
      stopped_reason: 'count_reached',
    },
  });
  // The newer activity is not polled; the stored result answers this lot.
  expect(invoke.mock.calls.map(([path]) => path)).toEqual(['character/craft']);
});

it('rejects craft fee limits above the server storage range before sending', async () => {
  const invoke = vi.spyOn(GameClient.prototype, 'invoke');
  await expect(
    execute(
      [
        'craft',
        '-c',
        'Maker0000000',
        '--recipe',
        'metal_ingot',
        '--max-fee-per-lot',
        '2147483648',
      ],
      vi.fn(),
    ),
  ).rejects.toMatchObject({ code: 'INVALID_ARGUMENTS' });
  expect(invoke).not.toHaveBeenCalled();
});

it('reports a replayed craft whose accepted activity had stopped', async () => {
  const invoke = vi
    .spyOn(GameClient.prototype, 'invoke')
    .mockResolvedValue(replayedCraftResult('STOPPED'));
  await expect(
    execute(
      [
        'craft',
        '-c',
        'Maker0000000',
        '--recipe',
        'metal_ingot',
        '--max-fee-per-lot',
        '2',
        '--request',
        '66666666-6666-4666-8666-666666666666',
      ],
      vi.fn(),
    ),
  ).resolves.toMatchObject({
    ok: false,
    error: {
      message: 'The repetition ended before all requested attempts completed.',
    },
    repetition: {
      requested_count: 1,
      completed_count: 0,
      produced: {},
      stopped_reason: 'activity_stopped',
    },
  });
  expect(invoke).toHaveBeenCalledTimes(1);
});

it('reports the current craft lot request ID when its result is unknown', async () => {
  const invoke = vi
    .spyOn(GameClient.prototype, 'invoke')
    .mockRejectedValue(new CliError('NETWORK_ERROR'));
  await expect(
    execute(
      [
        'craft',
        '-c',
        'Maker0000000',
        '--recipe',
        'metal_ingot',
        '--max-fee-per-lot',
        '2',
        '--count',
        '2',
      ],
      vi.fn(),
    ),
  ).rejects.toMatchObject({
    code: 'NETWORK_ERROR',
    detail: {
      request_id: expect.any(String),
      repetition: { requested_count: 2, completed_count: 0, produced: {} },
    },
  });
  expect(invoke).toHaveBeenCalledTimes(1);
});

it('requires a request ID in the craft protocol schema', () => {
  expect(
    craftSchema.safeParse({
      character_id: 'Maker0000000',
      recipe_id: 'metal_ingot',
      max_fee_per_lot: 2,
    }).success,
  ).toBe(false);
  expect(
    craftSchema.safeParse({
      character_id: 'Maker0000000',
      recipe_id: 'metal_ingot',
      max_fee_per_lot: 2,
      request_id: '44444444-4444-4444-8444-444444444444',
    }).success,
  ).toBe(true);
});
