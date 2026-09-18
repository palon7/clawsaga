import { afterEach, expect, it, vi } from 'vitest';
import { GameClient } from './client.js';
import { execute } from './commands.js';
import { withRenderedHints } from './hints.js';
import type { AgentGameResponse } from './protocol.js';

afterEach(() => vi.restoreAllMocks());

// 更新確認は公開リポジトリへ取りに行くため、単体試験では必ず失敗させて無効化する。
vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));

const response: AgentGameResponse = {
  ok: true,
  schema_version: '3.1',
  server_time: '2026-09-12T00:00:00.000Z',
  data: {},
};

it('renders server hints with CLI command syntax and keeps notes as written', () => {
  expect(
    withRenderedHints({
      ...response,
      hints: [
        { operation: 'hello', arguments: { character_id: 'm7Qp2_aR9L-x' } },
        { operation: 'get_activity', arguments: { activity_id: 'a1b2c3d4' } },
        {
          operation: 'equip_item',
          arguments: { equipment_id: '11111111-1111-4111-8111-111111111111' },
        },
        { note: 'Changing job puts your previous weapon in the bag.' },
      ],
    }).hints,
  ).toEqual([
    { note: 'Run `hello -c m7Qp2_aR9L-x`.' },
    { note: 'Run `activity -a a1b2c3d4`.' },
    {
      note: 'Run `equip --equipment 11111111-1111-4111-8111-111111111111`.',
    },
    { note: 'Changing job puts your previous weapon in the bag.' },
  ]);
});

it('adds the invoked character to hints for character commands', () => {
  expect(
    withRenderedHints(
      {
        ...response,
        hints: [
          { operation: 'get_activity', arguments: { activity_id: 'a1b2c3d4' } },
          {
            operation: 'equip_item',
            arguments: {
              equipment_id: '11111111-1111-4111-8111-111111111111',
            },
          },
        ],
      },
      'HintHero0000',
    ).hints,
  ).toEqual([
    { note: 'Run `activity -a a1b2c3d4 -c HintHero0000`.' },
    {
      note: 'Run `equip --equipment 11111111-1111-4111-8111-111111111111 -c HintHero0000`.',
    },
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
        arguments: { equipment_id: '11111111-1111-4111-8111-111111111111' },
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
        note: 'Run `equip --equipment 11111111-1111-4111-8111-111111111111 -c HintHero0000`.',
      },
    ],
  });
  expect(serverResponse.hints).toHaveLength(1);
  expect(invoke).toHaveBeenCalledTimes(1);
});

it('leaves failures and results without hints unchanged', async () => {
  const failure: AgentGameResponse = {
    ...response,
    ok: false,
    error: { message: 'Too many requests.' },
  };
  const invoke = vi
    .spyOn(GameClient.prototype, 'invoke')
    .mockResolvedValue(failure);
  expect(await execute(['hello', '-c', 'HintHero0000'], vi.fn())).toEqual(
    failure,
  );
  invoke.mockResolvedValue(response);
  expect(await execute(['map', '-c', 'HintHero0000'], vi.fn())).toEqual(
    response,
  );
});
