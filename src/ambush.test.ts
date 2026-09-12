import { randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { GameClient } from './client.js';
import { execute } from './commands.js';

vi.mock('node:timers/promises', () => ({
  setTimeout: () => Promise.resolve(),
}));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const field = { id: 'mossway', name: 'Mossway', kind: 'field' };
const town = { id: 'crossroads', name: 'Crossroads', kind: 'town' };
const startedAt = '2026-09-12T00:00:00.000Z';
const endedAt = '2026-09-12T00:00:45.000Z';

function response(data: Record<string, unknown>, running = false) {
  return Response.json({
    ok: true,
    schema_version: '2.0',
    locale: 'en',
    server_time: endedAt,
    user_content: [],
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

it.each([
  { count: 1, before: 0 },
  { count: 5, before: 1 },
  { count: 2, before: 1 },
])(
  'counts the ambushed harvest and ends --count $count after $before earlier harvests',
  async ({ count, before }) => {
    const request = requests();
    const ambush = { activity_id: randomUUID(), enemy_id: 'wolf' };
    const sourceIds: string[] = [];
    for (let index = 0; index <= before; index += 1) {
      const activity = {
        kind: 'gather',
        activity_id: randomUUID(),
        resource_id: 'mossway_herb',
        location: field,
        started_at: startedAt,
        completes_at: endedAt,
        duration_seconds: 45,
        output: {
          item_id: 'herb',
          name: 'Wolf Mint',
          quantity: 1,
          unit_weight: 1,
        },
      };
      sourceIds.push(activity.activity_id);
      request.mockResolvedValueOnce(
        response(
          {
            activity: {
              ...activity,
              status: 'RUNNING',
              ended_at: null,
              end_reason: null,
              produced_quantity: 0,
            },
          },
          true,
        ),
      );
      request.mockResolvedValueOnce(
        response({
          activity: {
            ...activity,
            status: 'ENDED',
            ended_at: endedAt,
            end_reason: 'COMPLETED',
            produced_quantity: 1,
            ...(index === before ? { ambush } : {}),
          },
          position: { kind: 'at_location', location: field },
        }),
      );
    }
    const result = await execute(
      ['gather', '-c', 'Traveler', '--item', 'herb', '--count', String(count)],
      vi.fn(),
    );
    expect(result).toMatchObject({
      ok: true,
      data: {
        activity: {
          activity_id: sourceIds.at(-1),
          status: 'ENDED',
          end_reason: 'COMPLETED',
          produced_quantity: 1,
          ambush,
        },
        position: { kind: 'at_location', location: field },
      },
      repetition: {
        requested_count: count,
        completed_count: before + 1,
        produced: { herb: before + 1 },
      },
    });
    expect(request).toHaveBeenCalledTimes((before + 1) * 2);
    for (const [index, sourceId] of sourceIds.entries()) {
      expect(new URL(String(request.mock.calls[index * 2]?.[0])).pathname).toBe(
        '/api/v1/character/gather',
      );
      const [url, options] = request.mock.calls[index * 2 + 1]!;
      expect(new URL(String(url)).pathname).toBe('/api/v1/character/activity');
      expect(JSON.parse(String(options?.body))).toEqual({
        character_id: 'Traveler',
        activity_id: sourceId,
      });
    }
  },
);

it('returns successful travel with the ambush and current position without waiting for combat', async () => {
  const request = requests();
  const ambush = { activity_id: randomUUID(), enemy_id: 'wolf' };
  const activity = {
    kind: 'travel',
    activity_id: randomUUID(),
    route_id: 'crossroads_to_mossway',
    from: town,
    to: field,
    started_at: startedAt,
    arrives_at: endedAt,
    duration_seconds: 45,
  };
  request.mockResolvedValueOnce(
    response(
      {
        activity: {
          ...activity,
          status: 'RUNNING',
          ended_at: null,
          end_reason: null,
        },
      },
      true,
    ),
  );
  request.mockResolvedValueOnce(
    response({
      activity: {
        ...activity,
        status: 'ENDED',
        ended_at: endedAt,
        end_reason: 'COMPLETED',
        characters: [],
        ambush,
      },
      position: { kind: 'at_location', location: town },
      scenery: { location_id: field.id, text: 'Trees line the path.' },
    }),
  );
  expect(
    await execute(
      ['travel', '-c', 'Traveler', '-r', activity.route_id],
      vi.fn(),
    ),
  ).toMatchObject({
    ok: true,
    data: {
      activity: {
        ...activity,
        status: 'ENDED',
        end_reason: 'COMPLETED',
        characters: [],
        ambush,
      },
      position: { kind: 'at_location', location: town },
      scenery: { location_id: field.id, text: 'Trees line the path.' },
    },
  });
  expect(request).toHaveBeenCalledTimes(2);
  expect(JSON.parse(String(request.mock.calls[1]?.[1]?.body))).toEqual({
    character_id: 'Traveler',
    activity_id: activity.activity_id,
  });
});

it('preserves map danger, aggressive enemies, combat triggers and unclaimed loot', async () => {
  const request = requests();
  const spawns = [
    { enemy_id: 'wolf', aggressive: true },
    { enemy_id: 'slime', aggressive: false },
  ];
  request.mockResolvedValueOnce(
    response({
      map: {
        content_version: 'movement-1',
        locations: [
          {
            ...field,
            danger_level: 20,
            ambush_chance_percent: 2,
            enemies: spawns,
          },
        ],
        routes: [],
        available_route_ids: [],
      },
    }),
  );
  expect(await execute(['map', '-c', 'Traveler'], vi.fn())).toMatchObject({
    data: {
      map: {
        locations: [
          { danger_level: 20, ambush_chance_percent: 2, enemies: spawns },
        ],
      },
    },
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
    await execute(['encounters', '-c', 'Traveler'], vi.fn()),
  ).toMatchObject({
    data: { encounters: spawns },
  });
  const combatId = randomUUID();
  const trigger = { activity_id: randomUUID(), kind: 'gather' };
  request.mockResolvedValueOnce(
    response(
      {
        activity: {
          kind: 'combat',
          activity_id: combatId,
          location: field,
          enemy_id: 'wolf',
          enemy_name: 'Wolf',
          practice: false,
          trigger,
          started_at: startedAt,
          time_limit_at: '2026-09-12T00:08:00.000Z',
          next_update_at: '2026-09-12T00:00:50.000Z',
          next_action: { kind: 'attack' },
          duration_seconds: 480,
          simulation_tick: 4,
          status: 'RUNNING',
          end_reason: null,
          ended_at: null,
          hp: 80,
          max_hp: 120,
          mp: 100,
          enemy_hp: 40,
          enemy_max_hp: 160,
          enemy_windup_ticks: 0,
          retreat_ticks: 0,
          retreat_requested_tick: null,
          potions_remaining: 0,
          statuses: [],
        },
      },
      true,
    ),
  );
  expect(
    await execute(['activity', '-c', 'Traveler', '-a', combatId], vi.fn()),
  ).toMatchObject({
    data: { activity: { activity_id: combatId, trigger, status: 'RUNNING' } },
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
        loot: [],
        unclaimed_loot: unclaimed,
        rules: [],
        frames: [],
      },
    }),
  );
  expect(
    await execute(['report', '-c', 'Traveler', '-a', combatId], vi.fn()),
  ).toMatchObject({
    data: { combat_report: { loot: [], unclaimed_loot: unclaimed } },
  });
  expect(request).toHaveBeenCalledTimes(4);
});
