import { afterEach, expect, it, vi } from 'vitest';
import { GameClient } from './client.js';
import { execute } from './commands.js';
import { withRenderedHints } from './hints.js';
import {
  agentSchemaVersion,
  type AgentGameResponse,
  type AgentHint,
} from './protocol.js';

afterEach(() => vi.restoreAllMocks());

const response: AgentGameResponse = {
  ok: true,
  schema_version: agentSchemaVersion,
  server_time: '2026-09-12T00:00:00.000Z',
  data: {},
};

it('renders server hints with CLI command syntax, adds the invoked character and keeps notes as written', () => {
  const hints: AgentHint[] = [
    { operation: 'hello', arguments: { character_id: 'm7Qp2_aR9L-x' } },
    { operation: 'get_activity', arguments: { activity_id: 'a1b2c3d4' } },
    {
      operation: 'equip_item',
      arguments: { instance_id: '11111111-1111-4111-8111-111111111111' },
    },
    { note: 'Changing job puts your previous weapon in the bag.' },
  ];
  expect(withRenderedHints({ ...response, hints }).hints).toEqual([
    { note: 'Run `hello -c m7Qp2_aR9L-x`.' },
    { note: 'Run `activity -a a1b2c3d4`.' },
    {
      note: 'Run `equip --instance 11111111-1111-4111-8111-111111111111`.',
    },
    { note: 'Changing job puts your previous weapon in the bag.' },
  ]);
  expect(
    withRenderedHints({ ...response, hints }, 'HintHero0000').hints,
  ).toEqual([
    { note: 'Run `hello -c m7Qp2_aR9L-x`.' },
    { note: 'Run `activity -a a1b2c3d4 -c HintHero0000`.' },
    {
      note: 'Run `equip --instance 11111111-1111-4111-8111-111111111111 -c HintHero0000`.',
    },
    { note: 'Changing job puts your previous weapon in the bag.' },
  ]);
});

it('names an operation it cannot render instead of guessing one', () => {
  expect(
    withRenderedHints({
      ...response,
      hints: [{ operation: 'some_future_operation' }],
    }).hints,
  ).toEqual([{ note: 'Use the some_future_operation operation.' }]);
});

it('renders hints from the result without another request', async () => {
  const serverResponse: AgentGameResponse = {
    ...response,
    hints: [
      {
        operation: 'equip_item',
        arguments: { instance_id: '11111111-1111-4111-8111-111111111111' },
      },
    ],
  };
  const invoke = vi
    .spyOn(GameClient.prototype, 'invoke')
    .mockResolvedValue(serverResponse);
  const result = await execute(
    [
      'buy',
      '--item',
      'basic_pickaxe',
      '--max-payment',
      '100',
      '-c',
      'HintHero0000',
      '-l',
      'ja',
    ],
    vi.fn(),
  );
  expect(result).toMatchObject({
    hints: [
      {
        note: 'Run `equip --instance 11111111-1111-4111-8111-111111111111 -c HintHero0000`.',
      },
    ],
  });
  expect(serverResponse.hints).toHaveLength(1);
  expect(invoke).toHaveBeenCalledTimes(1);
});

const travelId = '00000000-0000-4000-8000-000000000001';
const ambushId = '00000000-0000-4000-8000-000000000002';

function runningTravel(): AgentGameResponse {
  return {
    ...response,
    next_poll_after_seconds: 5,
    data: {
      activity: {
        kind: 'travel',
        activity_id: travelId,
        from: { id: 'dolgan', name: 'Dolgan', kind: 'town' },
        to: { id: 'openpit', name: 'Open pit', kind: 'field' },
        started_at: '2026-09-12T00:00:00.000Z',
        arrives_at: '2026-09-12T00:00:15.000Z',
        duration_seconds: 15,
        status: 'RUNNING',
      },
    },
  };
}

function runningCombat(activityId: string) {
  return {
    kind: 'combat',
    activity_id: activityId,
    enemy_id: 'wolf',
    enemy_name: 'Wolf',
    practice: false,
    started_at: '2026-09-12T00:00:45.000Z',
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
  } as const;
}

function gatherResultWithAmbush() {
  return {
    kind: 'gather',
    activity_id: '00000000-0000-4000-8000-000000000003',
    status: 'ENDED',
    end_reason: 'COMPLETED',
    ended_at: '2026-09-12T00:00:45.000Z',
    output: { item_id: 'herb', name: 'Wolf Mint', quantity: 1 },
    ambush: { activity_id: ambushId, enemy_id: 'wolf' },
  } as const;
}

it('describes a --no-wait acceptance as a receipt, not a completion', () => {
  expect(
    withRenderedHints(runningTravel(), 'HintHero0000', { wait: false }),
  ).toMatchObject({
    hints: [
      {
        note: `Your travel activity is in progress. Check it with \`activity -a ${travelId} -c HintHero0000\`.`,
      },
    ],
  });
  // The default wait adds no receipt.
  expect(
    withRenderedHints(runningTravel(), 'HintHero0000').hints,
  ).toBeUndefined();
});

it('describes a --no-wait finished result as a past result, even while another activity runs', () => {
  const finished: AgentGameResponse = {
    ...response,
    data: {
      activity: null,
      last_result: {
        kind: 'rest',
        activity_id: travelId,
        status: 'ENDED',
        end_reason: 'COMPLETED',
        ended_at: '2026-09-12T00:00:45.000Z',
        summary: {
          hp: 100,
          mp: 100,
          weakened_until: null,
        },
      },
    },
  };
  const stored = [
    {
      note: 'This rest activity has already finished. No new activity was started.',
    },
  ];
  expect(
    withRenderedHints(finished, 'HintHero0000', { wait: false }).hints,
  ).toEqual(stored);
  expect(
    withRenderedHints(
      {
        ...finished,
        data: { ...finished.data, activity: runningTravel().data.activity },
      },
      'HintHero0000',
      { wait: false },
    ).hints,
  ).toEqual(stored);
});

it('confirms an ambush result and keeps a running combat without a read suggestion', () => {
  expect(
    withRenderedHints(
      {
        ...response,
        hints: [
          { operation: 'get_activity', arguments: { activity_id: ambushId } },
        ],
        data: {
          activity: runningCombat(ambushId),
          last_result: gatherResultWithAmbush(),
        },
      },
      'HintHero0000',
    ).hints,
  ).toEqual([
    {
      note: 'The gather activity is complete. Continue the ambush battle or retreat.',
    },
  ]);
});

it('describes a past ambush and only then suggests reading its combat', () => {
  expect(
    withRenderedHints(
      {
        ...response,
        hints: [
          { operation: 'get_activity', arguments: { activity_id: ambushId } },
        ],
        data: { activity: null, last_result: gatherResultWithAmbush() },
      },
      'HintHero0000',
    ).hints,
  ).toEqual([
    {
      note: `The gather activity is complete. Read the ambush battle report with \`activity -a ${ambushId} -c HintHero0000\` if you have not seen it.`,
    },
  ]);
});

it('describes a past ambush without asserting that another running activity is its combat', () => {
  const running = runningTravel();
  expect(
    withRenderedHints(
      {
        ...running,
        data: { ...running.data, last_result: gatherResultWithAmbush() },
      },
      'HintHero0000',
    ).hints,
  ).toEqual([
    {
      note: `The gather activity is complete. Read the ambush battle report with \`activity -a ${ambushId} -c HintHero0000\` if you have not seen it.`,
    },
    { note: `Your travel activity (${travelId}) is now in progress.` },
  ]);
});

it('keeps a partial repetition and its payload while noting the confirmed count', () => {
  const partial = {
    ...response,
    ok: false,
    error: {
      message: 'The repetition ended before all requested attempts completed.',
    },
    data: {
      activity: runningCombat(ambushId),
      last_result: gatherResultWithAmbush(),
    },
    repetition: {
      requested_count: 10,
      completed_count: 3,
      produced: { herb: 3 },
      stopped_reason: 'ambush',
    },
  } as unknown as AgentGameResponse;
  const rendered = withRenderedHints(partial, 'HintHero0000');
  expect(rendered).toMatchObject({
    ok: false,
    error: partial.error,
    repetition: {
      requested_count: 10,
      completed_count: 3,
      produced: { herb: 3 },
      stopped_reason: 'ambush',
    },
    data: partial.data,
  });
  expect(rendered.hints).toEqual([
    {
      note: 'The gather activity is complete. Continue the ambush battle or retreat.',
    },
    {
      note: 'Stopped with 3 of 10 attempts completed. You keep their results.',
    },
  ]);
});
