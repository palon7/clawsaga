import { afterEach, expect, it, vi } from 'vitest';
import { agentSchemaVersion, type AgentGameResponse } from './protocol.js';
import { GameClient } from './client.js';
import { execute } from './commands.js';
import { CliError } from './errors.js';

vi.mock('node:timers/promises', () => ({
  setTimeout: () => Promise.resolve(),
}));
afterEach(() => {
  vi.restoreAllMocks();
});

const character = 'Traveler0000';
const routeArgs = ['travel', '-c', character, '--to', 'darras,openpit,mossway'];

function location(id: string) {
  return { id, name: id, kind: 'field' };
}

function departed(activityId: number, to: string): AgentGameResponse {
  return {
    ok: true,
    schema_version: agentSchemaVersion,
    server_time: '2026-10-27T00:00:00.000Z',
    next_poll_after_seconds: 5,
    data: {
      activity: {
        kind: 'travel',
        activity_id: activityId,
        to: location(to),
        started_at: '2026-10-27T00:00:00.000Z',
        arrives_at: '2026-10-27T00:00:15.000Z',
        status: 'RUNNING',
      },
    },
  };
}

function arrived(
  activityId: number,
  to: string,
  result: Record<string, unknown> = {},
): AgentGameResponse {
  return {
    ok: true,
    schema_version: agentSchemaVersion,
    server_time: '2026-10-27T00:00:15.000Z',
    data: {
      activity: null,
      last_result: {
        kind: 'travel',
        activity_id: activityId,
        status: 'ENDED',
        end_reason: 'COMPLETED',
        ended_at: '2026-10-27T00:00:15.000Z',
        to: location(to),
        ...result,
      },
    },
  };
}

const rejected: AgentGameResponse = {
  ok: false,
  schema_version: agentSchemaVersion,
  server_time: '2026-10-27T00:00:15.000Z',
  data: {},
  error: { message: 'That location is not adjacent.' },
};

function stubResponses(...responses: AgentGameResponse[]) {
  const invoke = vi.spyOn(GameClient.prototype, 'invoke');
  for (const response of responses) invoke.mockResolvedValueOnce(response);

  return invoke;
}

it('walks each location in order, starting a step only after the previous arrival', async () => {
  const questStep = arrived(1, 'darras', {
    quest_progress: { number: 4, ready_to_claim: true },
  });

  const invoke = stubResponses(
    departed(1, 'darras'),
    questStep,
    departed(2, 'openpit'),
    arrived(2, 'openpit'),
    departed(3, 'mossway'),
    arrived(3, 'mossway'),
  );

  const notify = vi.fn();

  expect(await execute(routeArgs, notify)).toMatchObject({
    ok: true,
    data: { last_result: { activity_id: 3 } },
    repetition: {
      requested_locations: ['darras', 'openpit', 'mossway'],
      arrived_locations: ['darras', 'openpit', 'mossway'],
      stopped_reason: 'route_completed',
    },
  });

  expect(invoke.mock.calls).toEqual(
    ['darras', 'openpit', 'mossway'].flatMap((to, index) => [
      ['character/travel', { character_id: character, to }],
      [
        'character/activity',
        { character_id: character, activity_id: index + 1 },
      ],
    ]),
  );

  // The last step reaches stdout, so only the earlier results go to stderr.
  expect(
    notify.mock.calls.map(([value]) => (value as { event: string }).event),
  ).toEqual([
    'activity_accepted',
    'activity_result',
    'activity_accepted',
    'activity_result',
    'activity_accepted',
  ]);
  expect(notify).toHaveBeenCalledWith({
    event: 'activity_result',
    last_result: questStep.data.last_result,
  });
});

it('stops after a mid-route ambush with that arrival and its battle', async () => {
  const invoke = stubResponses(
    departed(1, 'darras'),
    arrived(1, 'darras'),
    departed(2, 'openpit'),
    arrived(2, 'openpit', { ambush: { activity_id: 3 } }),
  );

  expect(await execute(routeArgs, vi.fn())).toMatchObject({
    ok: false,
    error: { message: 'The travel stopped before reaching every location.' },
    hints: [
      {
        note: `The travel activity is complete. Read the ambush battle report with \`activity -a 3 -c ${character}\` if you have not seen it.`,
      },
      {
        note: 'Stopped after arriving at 2 of 3 locations. No further steps were sent.',
      },
    ],
    data: { last_result: { activity_id: 2, ambush: { activity_id: 3 } } },
    repetition: {
      arrived_locations: ['darras', 'openpit'],
      stopped_reason: 'ambush',
    },
  });
  expect(invoke).toHaveBeenCalledTimes(4);
});

it.each<[string, AgentGameResponse[], Record<string, unknown>]>([
  ['start_rejected', [rejected], { error: rejected.error }],
  [
    'activity_stopped',
    [
      departed(2, 'openpit'),
      arrived(2, 'openpit', { end_reason: 'CANCELLED' }),
    ],
    { data: { last_result: { end_reason: 'CANCELLED' } } },
  ],
  ['activity_failed', [departed(2, 'openpit'), rejected], {}],
])(
  'sends no later step once the second step ends with %s',
  async (stoppedReason, secondStep, expected) => {
    const invoke = stubResponses(
      departed(1, 'darras'),
      arrived(1, 'darras'),
      ...secondStep,
    );

    expect(await execute(routeArgs, vi.fn())).toMatchObject({
      ok: false,
      ...expected,
      repetition: {
        arrived_locations: ['darras'],
        stopped_reason: stoppedReason,
      },
    });
    expect(invoke).toHaveBeenCalledTimes(2 + secondStep.length);
  },
);

it.each<[string, (invoke: ReturnType<typeof stubResponses>) => void]>([
  [
    'the arrival read is lost',
    (invoke) =>
      invoke.mockRejectedValueOnce(new CliError('SERVICE_UNAVAILABLE')),
  ],
  [
    'the step arrives somewhere else',
    (invoke) => invoke.mockResolvedValueOnce(arrived(2, 'mossway')),
  ],
])(
  'reports the second step as unconfirmed when %s',
  async (_case, secondResult) => {
    const invoke = stubResponses(
      departed(1, 'darras'),
      arrived(1, 'darras'),
      departed(2, 'openpit'),
    );

    secondResult(invoke);

    const failure = await execute(routeArgs, vi.fn()).catch(
      (error: unknown) => error,
    );

    if (!(failure instanceof CliError)) throw new Error('Expected a CliError');
    expect(failure.detail).toMatchObject({
      repetition: { arrived_locations: ['darras'], stopped_reason: 'unknown' },
    });
    expect(String(failure.detail.hint)).toContain(
      'Your activity may already have succeeded.',
    );
    expect(invoke).toHaveBeenCalledTimes(4);
  },
);

it.each([
  ['an empty entry', ['--to', 'darras,,openpit']],
  ['a trailing comma', ['--to', 'darras,']],
  ['a space', ['--to', 'darras, openpit']],
  ['--no-wait', ['--to', 'darras,openpit', '--no-wait']],
])('rejects a route with %s before any step', async (_case, flags) => {
  const invoke = vi.spyOn(GameClient.prototype, 'invoke');

  await expect(
    execute(['travel', '-c', character, ...flags], vi.fn()),
  ).rejects.toMatchObject({
    code: 'INVALID_ARGUMENTS',
    detail: { fields: ['to'] },
  });
  expect(invoke).not.toHaveBeenCalled();
});
