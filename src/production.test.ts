import { afterEach, expect, it, vi } from 'vitest';
import {
  agentGameResponseSchema,
  agentSchemaVersion,
  type AgentGameResponse,
} from './protocol.js';
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
            unit_weight: 8,
            tradeable: true,
            price: 10,
            quantity: 1,
            recovery_seconds: 60,
            equipment: {
              equip_slot: 'main_hand',
              required_job: 'warrior',
              required_job_name: 'Warrior',
              required_level: null,
              power: 9,
              armor: 0,
            },
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
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const gatherId = '11111111-1111-4111-8111-111111111111';

function running(): AgentGameResponse {
  return {
    ok: true,
    schema_version: agentSchemaVersion,
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
    schema_version: agentSchemaVersion,
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

it('preserves three confirmed harvests out of ten on an uncertain later start without retrying it', async () => {
  const invoke = vi
    .spyOn(GameClient.prototype, 'invoke')
    .mockResolvedValueOnce(running())
    .mockResolvedValueOnce(completed())
    .mockResolvedValueOnce(running())
    .mockResolvedValueOnce(completed())
    .mockResolvedValueOnce(running())
    .mockResolvedValueOnce(completed())
    .mockRejectedValueOnce(
      new CliError('NETWORK_ERROR', { outcome: 'unknown' }),
    );
  await expect(
    repeatActivity(
      new GameClient('https://example.com'),
      'character/gather',
      {},
      { character: 'Maker0000000' },
      10,
    ),
  ).rejects.toMatchObject({
    code: 'NETWORK_ERROR',
    detail: {
      repetition: {
        requested_count: 10,
        completed_count: 3,
        produced: { herb: 3 },
        stopped_reason: 'unknown',
      },
    },
  });
  expect(invoke).toHaveBeenCalledTimes(7);
});

it('keeps the confirmed harvests but claims no output when the next start is not sent', async () => {
  vi.spyOn(GameClient.prototype, 'accessToken')
    .mockResolvedValueOnce('test-token')
    .mockResolvedValueOnce('test-token')
    .mockRejectedValueOnce(new CliError('AUTH_REQUIRED'));
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json(running()))
    .mockResolvedValueOnce(Response.json(completed()));
  vi.stubGlobal('fetch', request);
  const error = await execute([...args, '--count', '2'], vi.fn()).catch(
    (thrown: unknown) => thrown,
  );
  if (!(error instanceof CliError)) throw new Error('Expected a CliError');
  // 2回目の開始はトークン取得で止まり、ゲーム要求は送っていない。
  expect(error.code).toBe('AUTH_REQUIRED');
  expect(error.detail).toMatchObject({
    outcome: 'not_sent',
    repetition: {
      requested_count: 2,
      completed_count: 1,
      produced: { herb: 1 },
      stopped_reason: 'start_rejected',
    },
  });
  // 開始していない回を「成果が出たかもしれない」と案内しない。
  expect(error.detail).not.toHaveProperty('hint');
  expect(
    request.mock.calls.map(([url]) => new URL(String(url)).pathname),
  ).toEqual(['/api/v1/character/gather', '/api/v1/character/activity']);
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

it('keeps the confirmed output and server failure when a repetition wait fails', async () => {
  const bodies: Array<Record<string, unknown>> = [];
  const failed: AgentGameResponse = {
    ok: false,
    schema_version: agentSchemaVersion,
    server_time: '2026-09-09T00:02:00.000Z',
    data: {},
    error: { message: 'The activity was not found.' },
  };
  const invoke = vi
    .spyOn(GameClient.prototype, 'invoke')
    .mockImplementation((path, body) => {
      if (path === 'character/activity')
        return Promise.resolve(bodies.length === 1 ? completedCraft() : failed);
      bodies.push(body as Record<string, unknown>);
      return Promise.resolve(runningCraft());
    });
  const result = await execute(
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
  );
  // 照会が失敗しただけなので、確定済みの成果とサーバー診断はそのまま残す。
  expect(result).toMatchObject({
    ok: false,
    error: { message: 'The activity was not found.' },
    repetition: {
      requested_count: 2,
      completed_count: 1,
      produced: { metal_ingot: 1 },
      stopped_reason: 'activity_failed',
    },
  });
  // 失敗した回は受付済みで結果が未確認なので、その旨を案内する。
  const notes = (result as { hints?: { note: string }[] }).hints?.map(
    (hint) => hint.note,
  );
  expect(notes).toHaveLength(1);
  expect(notes?.[0]).toContain('1 of 2 attempts are confirmed');
  expect(notes?.[0]).toContain('is not confirmed');
  expect(notes?.[0]).toContain('may have produced output');
  expect(invoke).toHaveBeenCalledTimes(4);
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
    schema_version: agentSchemaVersion,
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
    schema_version: agentSchemaVersion,
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
    schema_version: agentSchemaVersion,
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

it('returns one acceptance for --no-wait gather without polling or a repetition summary', async () => {
  const invoke = vi
    .spyOn(GameClient.prototype, 'invoke')
    .mockResolvedValue(running());
  const notify = vi.fn();
  const response = await execute([...args, '--no-wait'], notify);
  expect(response).toMatchObject({ ok: true, data: running().data });
  expect(response).not.toHaveProperty('repetition');
  expect(invoke).toHaveBeenCalledTimes(1);
  expect(invoke).toHaveBeenCalledWith('character/gather', {
    character_id: 'Maker0000000',
    item_id: 'herb',
  });
  expect(notify).not.toHaveBeenCalled();
});

it('rejects --no-wait with --count above one before any change', async () => {
  const invoke = vi.spyOn(GameClient.prototype, 'invoke');
  await expect(
    execute([...args, '--no-wait', '--count', '2'], vi.fn()),
  ).rejects.toMatchObject({
    code: 'INVALID_ARGUMENTS',
    detail: { fields: ['count'], help_command: 'clawsaga gather --help' },
  });
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
        '--no-wait',
        '--count',
        '2',
      ],
      vi.fn(),
    ),
  ).rejects.toMatchObject({
    code: 'INVALID_ARGUMENTS',
    detail: { fields: ['count'], help_command: 'clawsaga craft --help' },
  });
  expect(invoke).not.toHaveBeenCalled();
});

it('sends one generated request ID for a --no-wait craft without a repetition summary', async () => {
  const invoke = vi
    .spyOn(GameClient.prototype, 'invoke')
    .mockResolvedValue(runningCraft());
  const response = await execute(
    [
      'craft',
      '-c',
      'Maker0000000',
      '--recipe',
      'metal_ingot',
      '--max-fee-per-lot',
      '2',
      '--no-wait',
    ],
    vi.fn(),
  );
  expect(response).toMatchObject({ ok: true, data: runningCraft().data });
  expect(response).not.toHaveProperty('repetition');
  expect(invoke).toHaveBeenCalledTimes(1);
  expect(invoke.mock.calls[0]?.[0]).toBe('character/craft');
  expect(invoke.mock.calls[0]?.[1]).toMatchObject({
    character_id: 'Maker0000000',
    recipe_id: 'metal_ingot',
    max_fee_per_lot: 2,
    request_id: expect.any(String),
  });
});

it('omits the fee limit when the craft does not set one', async () => {
  const invoke = vi
    .spyOn(GameClient.prototype, 'invoke')
    .mockResolvedValue(runningCraft());
  const response = await execute(
    ['craft', '-c', 'Maker0000000', '--recipe', 'wolf_jerky', '--no-wait'],
    vi.fn(),
  );
  expect(response).toMatchObject({ ok: true });
  expect(invoke.mock.calls[0]?.[1]).toMatchObject({
    character_id: 'Maker0000000',
    recipe_id: 'wolf_jerky',
  });
  expect(invoke.mock.calls[0]?.[1]).not.toHaveProperty('max_fee_per_lot');
});

it('returns --no-wait results as receipts, keeping any already finished lot', async () => {
  // A replayed craft whose lot already ended answers with the stored result
  // even while an unrelated activity runs.
  const response = replayedCraftResult();
  response.data.activity = runningCraftActivity(
    '77777777-7777-4777-8777-777777777777',
  );
  response.next_poll_after_seconds = 30;
  const invoke = vi
    .spyOn(GameClient.prototype, 'invoke')
    .mockResolvedValue(response);
  const result = await execute(
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
      '--no-wait',
    ],
    vi.fn(),
  );
  expect(result).toMatchObject({
    ok: true,
    data: {
      last_result: { kind: 'craft', activity_id: craftId, status: 'ENDED' },
      activity: { activity_id: '77777777-7777-4777-8777-777777777777' },
    },
  });
  expect(result).not.toHaveProperty('repetition');
  // 冪等再送の終了結果は「開始した」ではなく、保存済みの過去結果として案内する。
  const notes = (result as { hints?: { note: string }[] }).hints?.map(
    (hint) => hint.note,
  );
  expect(notes).toEqual([
    'This is the stored result of an earlier accepted craft activity, not a new start.',
  ]);
  expect(invoke).toHaveBeenCalledTimes(1);
});

it('keeps the generated craft request ID and recovery hint when a --no-wait result is unknown', async () => {
  const invoke = vi
    .spyOn(GameClient.prototype, 'invoke')
    .mockRejectedValue(new CliError('NETWORK_ERROR', { outcome: 'unknown' }));
  const error = await execute(
    [
      'craft',
      '-c',
      'Maker0000000',
      '--recipe',
      'metal_ingot',
      '--max-fee-per-lot',
      '2',
      '--no-wait',
    ],
    vi.fn(),
  ).catch((thrown: unknown) => thrown);
  if (!(error instanceof CliError)) throw new Error('Expected a CliError');
  const hint = String(error.detail.hint);
  expect(error.code).toBe('NETWORK_ERROR');
  expect(error.detail.request_id).toEqual(expect.any(String));
  expect(hint).toContain('may have produced output');
  expect(hint).toContain('same recipe, fee limit');
  expect(hint).toContain(`--request ${String(error.detail.request_id)}`);
  expect(hint).toContain(
    'Do not start another lot or resend the remaining count',
  );
  // 同一IDの再送は既に成立していても安全なので、未実行の証明を要求しない。
  expect(hint).not.toContain('only if it did not take effect');
  // 同一IDの再送が同じロットを照合するため、種類・時刻の突き合わせは求めない。
  expect(hint).not.toContain('match its kind and time');
  expect(invoke).toHaveBeenCalledTimes(1);
});

it('keeps the generated craft request ID and recovery hint when a --no-wait reply cannot be read', async () => {
  const invoke = vi.spyOn(GameClient.prototype, 'invoke').mockRejectedValue(
    new CliError('INVALID_RESPONSE', {
      message: "The server response did not match this CLI's expected format.",
      operation: 'character/craft',
      http_status: 200,
      fields: ['data.activity'],
    }),
  );
  const error = await execute(
    [
      'craft',
      '-c',
      'Maker0000000',
      '--recipe',
      'metal_ingot',
      '--max-fee-per-lot',
      '2',
      '--no-wait',
    ],
    vi.fn(),
  ).catch((thrown: unknown) => thrown);
  if (!(error instanceof CliError)) throw new Error('Expected a CliError');
  // 応答が読めない場合も、同じIDの再送で同じロットを照合できる。
  expect(error.code).toBe('INVALID_RESPONSE');
  expect(error.detail.outcome).toBe('unknown');
  expect(error.detail.request_id).toEqual(expect.any(String));
  const hint = String(error.detail.hint);
  expect(hint).toContain('same recipe, fee limit');
  expect(hint).toContain(`--request ${String(error.detail.request_id)}`);
  expect(invoke).toHaveBeenCalledTimes(1);
});

it('keeps the generated craft request ID and recovery hint when the server schema is newer', async () => {
  vi.spyOn(GameClient.prototype, 'invoke').mockRejectedValue(
    new CliError('UPDATE_REQUIRED', {
      operation: 'character/craft',
      http_status: 200,
    }),
  );
  const error = await execute(
    [
      'craft',
      '-c',
      'Maker0000000',
      '--recipe',
      'metal_ingot',
      '--max-fee-per-lot',
      '2',
      '--no-wait',
    ],
    vi.fn(),
  ).catch((thrown: unknown) => thrown);
  if (!(error instanceof CliError)) throw new Error('Expected a CliError');
  // 更新後に開始し直すのではなく、同じIDでそのロットを照合できるようにする。
  expect(error.code).toBe('UPDATE_REQUIRED');
  expect(error.detail).toMatchObject({
    operation: 'character/craft',
    http_status: 200,
    outcome: 'unknown',
  });
  expect(error.detail.request_id).toEqual(expect.any(String));
  const hint = String(error.detail.hint);
  expect(hint).toContain('same recipe, fee limit');
  expect(hint).toContain(`--request ${String(error.detail.request_id)}`);
});

it('reconciles an uncertain purchase by its same request without craft steps', async () => {
  vi.spyOn(GameClient.prototype, 'invoke').mockRejectedValue(
    new CliError('NETWORK_ERROR', { outcome: 'unknown' }),
  );
  const error = await execute(
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
  ).catch((thrown: unknown) => thrown);
  if (!(error instanceof CliError)) throw new Error('Expected a CliError');
  const hint = String(error.detail.hint);
  expect(error.detail.request_id).toEqual(expect.any(String));
  expect(hint).toContain('same arguments');
  expect(hint).toContain(`--request ${String(error.detail.request_id)}`);
  expect(hint).not.toContain('recipe');
  expect(hint).not.toContain('remaining count');
});

it('reports each waited acceptance to stderr, with the craft request ID', async () => {
  const invoke = vi
    .spyOn(GameClient.prototype, 'invoke')
    .mockImplementation((path) =>
      Promise.resolve(path === 'character/activity' ? completed() : running()),
    );
  const notify = vi.fn();
  await execute([...args, '--count', '2'], notify);
  expect(notify).toHaveBeenCalledTimes(2);
  expect(notify).toHaveBeenCalledWith({
    event: 'activity_accepted',
    activity_id: gatherId,
    kind: 'gather',
    started_at: '2026-09-09T00:00:00.000Z',
    completes_at: '2026-09-09T00:00:45.000Z',
    next_poll_after_seconds: 1,
  });

  const bodies: Array<Record<string, unknown>> = [];
  invoke.mockReset().mockImplementation((path, body) => {
    if (path === 'character/activity') return Promise.resolve(completedCraft());
    bodies.push(body as Record<string, unknown>);
    return Promise.resolve(runningCraft());
  });
  const craftNotify = vi.fn();
  await execute(
    [
      'craft',
      '-c',
      'Maker0000000',
      '--recipe',
      'metal_ingot',
      '--max-fee-per-lot',
      '2',
    ],
    craftNotify,
  );
  expect(craftNotify).toHaveBeenCalledWith(
    expect.objectContaining({
      event: 'activity_accepted',
      kind: 'craft',
      next_poll_after_seconds: 1,
      request_id: bodies[0]?.request_id,
    }),
  );
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
