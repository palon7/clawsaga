import { afterEach, expect, it, vi } from 'vitest';
import { GameClient } from './client.js';
import { execute } from './commands.js';
import { withCommandHints } from './hints.js';
import type { AgentGameResponse } from './protocol.js';

afterEach(() => vi.restoreAllMocks());

const response: AgentGameResponse = {
  ok: true,
  schema_version: '3.0',
  server_time: '2026-09-12T00:00:00.000Z',
  locale: 'ja',
  data: {},
};

it.each([
  { args: ['hello'], expected: 'plan-set' },
  { args: ['change-job', '--job', 'mage'], expected: 'compatible weapon' },
  {
    args: ['buy', '--item', 'basic_pickaxe', '--max-payment', '100'],
    expected: '--equipment 11111111-1111-4111-8111-111111111111',
  },
])(
  'adds English hints to $args without another request',
  async ({ args, expected }) => {
    const serverResponse: AgentGameResponse = {
      ...response,
      data:
        args[0] === 'buy'
          ? {
              purchase: {
                request_id: '22222222-2222-4222-8222-222222222222',
                item_id: 'basic_pickaxe',
                equipment_id: '11111111-1111-4111-8111-111111111111',
                paid: 100,
              },
            }
          : {},
    };
    const invoke = vi
      .spyOn(GameClient.prototype, 'invoke')
      .mockResolvedValue(serverResponse);
    const result = await execute(
      [...args, '-c', 'HintHero', '-l', 'ja'],
      vi.fn(),
    );
    expect(result).toMatchObject({
      ...serverResponse,
      hints: expect.arrayContaining([expect.stringContaining(expected)]),
    });
    expect(serverResponse).not.toHaveProperty('hints');
    expect(invoke).toHaveBeenCalledTimes(1);
  },
);

it('provides an executable hello example after create', () => {
  const created: AgentGameResponse = {
    ...response,
    data: {
      created: { public_id: 'Aster' },
      next_step: { operation: 'hello', arguments: { character_id: 'Aster' } },
    },
  };
  expect(withCommandHints('create', created).hints).toEqual([
    'Run hello -c Aster to start playing.',
  ]);
});

it('leaves failures and ordinary reads unchanged', async () => {
  const failure: AgentGameResponse = {
    ...response,
    ok: false,
    error: { message: 'Too many requests.' },
  };
  const invoke = vi
    .spyOn(GameClient.prototype, 'invoke')
    .mockResolvedValue(failure);
  expect(await execute(['hello', '-c', 'HintHero'], vi.fn())).toEqual(failure);
  invoke.mockResolvedValue(response);
  expect(await execute(['map', '-c', 'HintHero'], vi.fn())).toEqual(response);
});
