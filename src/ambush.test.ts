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
  { count: 2, before: 1 },
  { count: 5, before: 1 },
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
      expect(
        new URL(request.mock.calls[index * 2]?.[0] as string).pathname,
      ).toBe('/api/v1/character/gather');
      const [url, options] = request.mock.calls[index * 2 + 1]!;
      expect(new URL(url as string).pathname).toBe(
        '/api/v1/character/activity',
      );
      expect(JSON.parse(options?.body as string)).toEqual({
        character_id: 'Traveler0000',
        activity_id: sourceId,
      });
    }
  },
);

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
      ([url]) => new URL(url as string).pathname === '/api/v1/character/gather',
    ),
  ).toHaveLength(1);
});
