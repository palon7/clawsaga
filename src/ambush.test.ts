import { randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { GameClient } from './client.js';
import { execute } from './commands.js';
import { agentSchemaVersion } from './protocol.js';

vi.mock('node:timers/promises', () => ({
  setTimeout: () => Promise.resolve(),
}));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const field = { id: 'mossway', name: 'Mossway', kind: 'field' };
const startedAt = '2026-09-12T00:00:00.000Z';
const endedAt = '2026-09-12T00:00:45.000Z';

function response(data: Record<string, unknown>, running = false) {
  return Response.json({
    ok: true,
    schema_version: agentSchemaVersion,
    server_time: endedAt,
    ...(running ? { next_poll_after_seconds: 1 } : {}),
    data,
  });
}

function requests() {
  vi.spyOn(GameClient.prototype, 'accessToken').mockResolvedValue('test-token');
  const request = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', request);
  return request;
}

function runningGather(activityId: string) {
  return {
    kind: 'gather',
    activity_id: activityId,
    status: 'RUNNING',
    started_at: startedAt,
    completes_at: endedAt,
    duration_seconds: 45,
    output: { item_id: 'herb', name: 'Wolf Mint', quantity: 1 },
  };
}

function runningCombat(activityId: string) {
  return {
    kind: 'combat',
    activity_id: activityId,
    enemy_id: 'wolf',
    enemy_name: 'Wolf',
    practice: false,
    started_at: startedAt,
    time_limit_at: '2026-09-12T00:08:00.000Z',
    next_update_at: '2026-09-12T00:00:50.000Z',
    duration_seconds: 480,
    status: 'RUNNING',
    hp: 80,
    max_hp: 120,
    mp: 100,
    enemy_hp: 40,
    enemy_max_hp: 160,
    retreat_ticks: 0,
    retreat_requested_tick: null,
  };
}

it.each([
  { count: 1, before: 0 },
  { count: 5, before: 1 },
  { count: 2, before: 1 },
  { count: 10, before: 2 },
  { count: 10, before: 9 },
])(
  'counts the ambushed harvest and ends --count $count after $before earlier harvests',
  async ({ count, before }) => {
    const request = requests();
    const sourceIds: string[] = [];
    for (let index = 0; index <= before; index += 1) {
      const activityId = randomUUID();
      sourceIds.push(activityId);
      request.mockResolvedValueOnce(
        response({ activity: runningGather(activityId) }, true),
      );
      const ambush =
        index === before
          ? { activity_id: randomUUID(), enemy_id: 'wolf' }
          : undefined;
      request.mockResolvedValueOnce(
        response({
          activity:
            index === before ? runningCombat(ambush!.activity_id) : null,
          last_result: {
            kind: 'gather',
            activity_id: activityId,
            status: 'ENDED',
            end_reason: 'COMPLETED',
            ended_at: endedAt,
            output: { item_id: 'herb', name: 'Wolf Mint', quantity: 1 },
            ...(ambush ? { ambush } : {}),
          },
        }),
      );
    }
    const result = await execute(
      [
        'gather',
        '-c',
        'Traveler0000',
        '--item',
        'herb',
        '--count',
        String(count),
      ],
      vi.fn(),
    );
    const completedAll = before + 1 === count;
    expect(result).toMatchObject({
      ok: completedAll,
      data: {
        last_result: {
          activity_id: sourceIds.at(-1),
          kind: 'gather',
          status: 'ENDED',
          end_reason: 'COMPLETED',
          output: { item_id: 'herb', quantity: 1 },
        },
      },
      repetition: {
        requested_count: count,
        completed_count: before + 1,
        produced: { herb: before + 1 },
        stopped_reason: 'ambush',
      },
    });
    if (completedAll) expect(result).not.toHaveProperty('error');
    else
      expect(result).toHaveProperty(
        'error.message',
        'The repetition ended before all requested attempts completed.',
      );
    expect(request).toHaveBeenCalledTimes((before + 1) * 2);
    for (const [index, sourceId] of sourceIds.entries()) {
      expect(new URL(String(request.mock.calls[index * 2]?.[0])).pathname).toBe(
        '/api/v1/character/gather',
      );
      const [url, options] = request.mock.calls[index * 2 + 1]!;
      expect(new URL(String(url)).pathname).toBe('/api/v1/character/activity');
      expect(JSON.parse(String(options?.body))).toEqual({
        character_id: 'Traveler0000',
        activity_id: sourceId,
      });
    }
  },
);

it('returns arrival with the ambush result and the active combat', async () => {
  const request = requests();
  const travelId = randomUUID();
  const combatId = randomUUID();
  const ambush = { activity_id: combatId, enemy_id: 'wolf' };
  request.mockResolvedValueOnce(
    response(
      {
        activity: {
          kind: 'travel',
          activity_id: travelId,
          from: { id: 'crossroads', name: 'Crossroads', kind: 'town' },
          to: field,
          started_at: startedAt,
          arrives_at: endedAt,
          duration_seconds: 45,
          status: 'RUNNING',
        },
      },
      true,
    ),
  );
  request.mockResolvedValueOnce(
    response({
      activity: runningCombat(combatId),
      last_result: {
        kind: 'travel',
        activity_id: travelId,
        status: 'ENDED',
        end_reason: 'COMPLETED',
        ended_at: endedAt,
        to: field,
        ambush,
      },
      scenery: { location_id: field.id, text: 'Trees line the path.' },
    }),
  );
  expect(
    await execute(['travel', '-c', 'Traveler0000', '--to', 'mossway'], vi.fn()),
  ).toMatchObject({
    ok: true,
    data: {
      activity: { kind: 'combat', activity_id: combatId, status: 'RUNNING' },
      last_result: {
        kind: 'travel',
        activity_id: travelId,
        status: 'ENDED',
        end_reason: 'COMPLETED',
        to: field,
        ambush,
      },
      scenery: { location_id: field.id, text: 'Trees line the path.' },
    },
  });
  expect(request).toHaveBeenCalledTimes(2);
  expect(JSON.parse(String(request.mock.calls[1]?.[1]?.body))).toEqual({
    character_id: 'Traveler0000',
    activity_id: travelId,
  });
});

it('preserves look enemies, the active combat and unclaimed loot', async () => {
  const request = requests();
  const spawns = [
    { enemy_id: 'wolf', aggressive: true },
    { enemy_id: 'slime', aggressive: false },
  ];
  const lookEnemies = [
    { enemy_id: 'wolf', name: 'Wolf', aggressive: true },
    { enemy_id: 'slime', name: 'Slime', aggressive: false },
  ];
  request.mockResolvedValueOnce(
    response({
      look: {
        location: field,
        chat: { id: 'selene', name: 'Selene' },
        resources: [],
        enemies: lookEnemies,
        facilities: [],
      },
    }),
  );
  expect(await execute(['look', '-c', 'Traveler0000'], vi.fn())).toMatchObject({
    data: { look: { location: field, enemies: lookEnemies } },
  });
  request.mockResolvedValueOnce(
    response({
      encounters: spawns.map((spawn) => ({
        ...spawn,
        name: spawn.enemy_id,
        description: 'A local enemy.',
        level: 1,
        max_hp: 160,
        power: 10,
        armor: 5,
        heavy_power_percent: 250,
        heavy_period_ticks: 5,
        heavy_poison_ticks: 0,
        damage_type: 'physical',
        resistances: { physical: 0, fire: 0, ice: 0, lightning: 0, holy: 0 },
        practice: false,
      })),
    }),
  );
  expect(
    await execute(['encounters', '-c', 'Traveler0000'], vi.fn()),
  ).toMatchObject({
    data: { encounters: spawns },
  });
  const combatId = randomUUID();
  request.mockResolvedValueOnce(
    response({ activity: runningCombat(combatId) }, true),
  );
  expect(
    await execute(['activity', '-c', 'Traveler0000', '-a', combatId], vi.fn()),
  ).toMatchObject({
    data: { activity: { activity_id: combatId, status: 'RUNNING' } },
  });
  const unclaimed = [
    {
      item_id: 'wolf_meat',
      name: 'Wolf Meat',
      quantity: 1,
      reason: 'BAG_FULL',
    },
  ];
  request.mockResolvedValueOnce(
    response({
      combat_report: {
        activity_id: combatId,
        outcome: 'VICTORY',
        practice: false,
        elapsed_seconds: 50,
        damage_dealt: 160,
        damage_taken: 40,
        healing: 0,
        potions_used: 0,
        experience_gained: 12,
        gold_gained: 2,
        loot: [],
        unclaimed_loot: unclaimed,
        rules: [],
        frames: [],
      },
    }),
  );
  expect(
    await execute(['report', '-c', 'Traveler0000', '-a', combatId], vi.fn()),
  ).toMatchObject({
    data: { combat_report: { loot: [], unclaimed_loot: unclaimed } },
  });
  expect(request).toHaveBeenCalledTimes(4);
});

function endedGather(activityId: string, ambushId?: string) {
  return {
    kind: 'gather',
    activity_id: activityId,
    status: 'ENDED',
    end_reason: 'COMPLETED',
    ended_at: endedAt,
    output: { item_id: 'herb', name: 'Wolf Mint', quantity: 1 },
    ...(ambushId
      ? { ambush: { activity_id: ambushId, enemy_id: 'wolf' } }
      : {}),
  };
}

function notes(result: unknown) {
  return (result as { hints?: { note: string }[] }).hints?.map(
    (hint) => hint.note,
  );
}

it('keeps the confirmed harvests and names the running ambush combat', async () => {
  const request = requests();
  const ambushId = randomUUID();
  for (let index = 0; index < 4; index += 1) {
    const activityId = randomUUID();
    const ambushed = index === 3;
    request.mockResolvedValueOnce(
      response({ activity: runningGather(activityId) }, true),
    );
    request.mockResolvedValueOnce(
      response({
        activity: ambushed ? runningCombat(ambushId) : null,
        last_result: endedGather(activityId, ambushed ? ambushId : undefined),
      }),
    );
  }
  const result = await execute(
    ['gather', '-c', 'Traveler0000', '--item', 'herb', '--count', '10'],
    vi.fn(),
  );
  expect(result).toMatchObject({
    ok: false,
    repetition: {
      requested_count: 10,
      completed_count: 4,
      produced: { herb: 4 },
      stopped_reason: 'ambush',
    },
  });
  expect(notes(result)).toEqual([
    `The gather result is confirmed and combat ${ambushId} is the current activity; continue or stop that battle instead of repeating the finished activity.`,
    '4 of 10 attempts are confirmed and their output is kept; the repetition stopped before the rest.',
  ]);
});

it('keeps the final ambush harvest successful and only names the running combat', async () => {
  const request = requests();
  const ambushId = randomUUID();
  for (let index = 0; index < 4; index += 1) {
    const activityId = randomUUID();
    const ambushed = index === 3;
    request.mockResolvedValueOnce(
      response({ activity: runningGather(activityId) }, true),
    );
    request.mockResolvedValueOnce(
      response({
        activity: ambushed ? runningCombat(ambushId) : null,
        last_result: endedGather(activityId, ambushed ? ambushId : undefined),
      }),
    );
  }
  const result = await execute(
    ['gather', '-c', 'Traveler0000', '--item', 'herb', '--count', '4'],
    vi.fn(),
  );
  expect(result).toMatchObject({
    ok: true,
    repetition: {
      requested_count: 4,
      completed_count: 4,
      produced: { herb: 4 },
      stopped_reason: 'ambush',
    },
  });
  expect(result).not.toHaveProperty('error');
  expect(notes(result)).toEqual([
    `The gather result is confirmed and combat ${ambushId} is the current activity; continue or stop that battle instead of repeating the finished activity.`,
  ]);
});

it('describes an ambush that already ended as a past result', async () => {
  const request = requests();
  const activityId = randomUUID();
  const ambushId = randomUUID();
  request.mockResolvedValueOnce(
    response({ activity: runningGather(activityId) }, true),
  );
  request.mockResolvedValueOnce(
    response({
      activity: null,
      last_result: endedGather(activityId, ambushId),
    }),
  );
  expect(
    notes(
      await execute(
        ['gather', '-c', 'Traveler0000', '--item', 'herb'],
        vi.fn(),
      ),
    ),
  ).toEqual([
    `An ambush happened after the confirmed gather result, which stands; that combat is not the current activity. Read its outcome with \`activity -a ${ambushId} -c Traveler0000\` if you have not seen it.`,
  ]);
});

it('describes an ambush that ended before another activity without asserting it runs', async () => {
  const request = requests();
  const activityId = randomUUID();
  const ambushId = randomUUID();
  const nextId = randomUUID();
  request.mockResolvedValueOnce(
    response({ activity: runningGather(activityId) }, true),
  );
  request.mockResolvedValueOnce(
    response({
      activity: {
        kind: 'travel',
        activity_id: nextId,
        from: field,
        to: { id: 'dolgan', name: 'Dolgan', kind: 'town' },
        started_at: startedAt,
        arrives_at: endedAt,
        duration_seconds: 45,
        status: 'RUNNING',
      },
      last_result: endedGather(activityId, ambushId),
    }),
  );
  expect(
    notes(
      await execute(
        ['gather', '-c', 'Traveler0000', '--item', 'herb'],
        vi.fn(),
      ),
    ),
  ).toEqual([
    `An ambush happened after the confirmed gather result, which stands; that combat is not the current activity. Read its outcome with \`activity -a ${ambushId} -c Traveler0000\` if you have not seen it.`,
    `A different travel activity (${nextId}) is running now.`,
  ]);
});

it('adds a recovery hint when a wait outcome is unknown', async () => {
  const request = requests();
  const activityId = randomUUID();
  request.mockResolvedValueOnce(
    response({ activity: runningGather(activityId) }, true),
  );
  request.mockRejectedValueOnce(new TypeError('socket hang up'));
  await expect(
    execute(['gather', '-c', 'Traveler0000', '--item', 'herb'], vi.fn()),
  ).rejects.toMatchObject({
    code: 'NETWORK_ERROR',
    detail: {
      activity_id: activityId,
      outcome: 'unknown',
      hint: expect.stringContaining(`activity -a ${activityId}`),
    },
  });
  // The start is sent once; the CLI never re-sends the activity.
  expect(
    request.mock.calls.filter(
      ([url]) => new URL(String(url)).pathname === '/api/v1/character/gather',
    ),
  ).toHaveLength(1);
});
