import { afterEach, expect, it, vi } from 'vitest';
import { execute } from './commands.js';
import { GameClient } from './client.js';
import { stubInvoke } from './test-responses.js';
import { agentSchemaVersion } from './protocol.js';

afterEach(() => vi.restoreAllMocks());

const character = 'm7Qp2_aR9L-x';

it('lists the house subcommands without sending a request', async () => {
  const invoke = vi.spyOn(GameClient.prototype, 'invoke');

  for (const args of [['house'], ['house', '--help']]) {
    expect(await execute(args, vi.fn())).toMatchObject({
      ok: true,
      help: {
        command: 'clawsaga house',
        commands: [
          { name: 'house status' },
          { name: 'house buy' },
          { name: 'house extend' },
          { name: 'house build' },
          { name: 'house place' },
          { name: 'house remove' },
          { name: 'house sleep' },
          { name: 'house deposit' },
          { name: 'house withdraw' },
        ],
      },
    });
  }

  expect(await execute([], vi.fn())).toMatchObject({
    help: {
      commands: expect.arrayContaining([
        { name: 'house', description: expect.any(String) },
      ]),
    },
  });
  expect(invoke).not.toHaveBeenCalled();
});

it('shows the help of one house subcommand', async () => {
  expect(await execute(['house', 'status', '--help'], vi.fn())).toMatchObject({
    ok: true,
    help: {
      command: 'clawsaga house status',
      usage: 'clawsaga house status -c <id> [options]',
      data_keys: expect.arrayContaining(['house']),
    },
  });
});

it('sends --item pairs as the materials to build with', async () => {
  const invoke = stubInvoke({
    ok: true,
    schema_version: agentSchemaVersion,
    server_time: '2026-11-02T00:00:00.000Z',
    data: {},
  });

  await execute(
    [
      'house',
      'build',
      '-c',
      character,
      '--item',
      'oak_lumber:20,metal_ingot:10',
    ],
    vi.fn(),
  );

  expect(invoke).toHaveBeenCalledWith('character/house/build', {
    character_id: character,
    items: [
      { item_id: 'oak_lumber', quantity: 20 },
      { item_id: 'metal_ingot', quantity: 10 },
    ],
  });

  invoke.mockClear();
  for (const item of ['oak_lumber', 'oak_lumber:20:1', 'oak_lumber:-1']) {
    await expect(
      execute(['house', 'build', '-c', character, '--item', item], vi.fn()),
    ).rejects.toMatchObject({
      code: 'INVALID_ARGUMENTS',
      detail: { help_command: 'clawsaga house build --help' },
    });
  }

  expect(invoke).not.toHaveBeenCalled();
});

it('sends the house name with the plot purchase', async () => {
  const invoke = stubInvoke({
    ok: true,
    schema_version: agentSchemaVersion,
    server_time: '2026-11-02T00:00:00.000Z',
    data: {},
  });

  await execute(
    ['house', 'buy', '-c', character, '--name', 'Mossy Cottage'],
    vi.fn(),
  );

  expect(invoke).toHaveBeenCalledWith('character/house/buy', {
    character_id: character,
    name: 'Mossy Cottage',
  });
});

it('sends the slot and the furniture instance to place', async () => {
  const invoke = stubInvoke({
    ok: true,
    schema_version: agentSchemaVersion,
    server_time: '2026-11-02T00:00:00.000Z',
    data: {},
  });

  await execute(
    [
      'house',
      'place',
      '-c',
      character,
      '--slot',
      'bed',
      '--instance',
      'k3v9q2m8x1',
    ],
    vi.fn(),
  );

  expect(invoke).toHaveBeenCalledWith('character/house/place', {
    character_id: character,
    slot: 'bed',
    instance_id: 'k3v9q2m8x1',
  });
});
