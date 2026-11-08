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
          { name: 'house renovate' },
          { name: 'house build' },
          { name: 'house place' },
          { name: 'house remove' },
          { name: 'house sleep' },
          { name: 'house deposit' },
          { name: 'house withdraw' },
          { name: 'house records' },
          { name: 'house record' },
          { name: 'house visit' },
          { name: 'house find' },
          { name: 'house prices' },
          { name: 'house describe' },
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

it('sends the room to renovate and reads the record options', async () => {
  const invoke = stubInvoke({
    ok: true,
    schema_version: agentSchemaVersion,
    server_time: '2026-11-02T00:00:00.000Z',
    data: {},
  });

  await execute(
    ['house', 'renovate', '-c', character, '--room', 'trophy_room'],
    vi.fn(),
  );
  await execute(['house', 'records', '-c', character], vi.fn());

  expect(invoke).toHaveBeenNthCalledWith(1, 'character/house/renovate', {
    character_id: character,
    room: 'trophy_room',
  });
  expect(invoke).toHaveBeenNthCalledWith(2, 'character/house/records', {
    character_id: character,
  });
});

it('sends the record to display, or null with --clear', async () => {
  const invoke = stubInvoke({
    ok: true,
    schema_version: agentSchemaVersion,
    server_time: '2026-11-02T00:00:00.000Z',
    data: {},
  });

  const record = ['house', 'record', '-c', character, '--slot', '2'];

  await execute([...record, '--record', 'achievement:first_defeat'], vi.fn());
  await execute([...record, '--clear'], vi.fn());

  expect(invoke).toHaveBeenNthCalledWith(1, 'character/house/record', {
    character_id: character,
    slot: 2,
    record: 'achievement:first_defeat',
  });
  expect(invoke).toHaveBeenNthCalledWith(2, 'character/house/record', {
    character_id: character,
    slot: 2,
    record: null,
  });

  invoke.mockClear();
  for (const args of [
    record,
    [...record, '--record', 'achievement:first_defeat', '--clear'],
  ]) {
    await expect(execute(args, vi.fn())).rejects.toMatchObject({
      code: 'INVALID_ARGUMENTS',
      detail: { message: 'Pass either --record or --clear.' },
    });
  }

  expect(invoke).not.toHaveBeenCalled();
});

it('sends the owner to visit, the room to find and the guest room price limit', async () => {
  const invoke = stubInvoke({
    ok: true,
    schema_version: agentSchemaVersion,
    server_time: '2026-11-08T00:00:00.000Z',
    data: {},
  });

  await execute(
    ['house', 'visit', '-c', character, '--owner', 'Aster0000000'],
    vi.fn(),
  );
  await execute(
    [
      'house',
      'find',
      '-c',
      character,
      '--renting',
      'furnace',
      '--location',
      'selene_residential',
    ],
    vi.fn(),
  );
  await execute(
    ['house', 'sleep', '-c', character, '--max-price', '120'],
    vi.fn(),
  );

  expect(invoke).toHaveBeenNthCalledWith(1, 'character/house/visit', {
    character_id: character,
    owner_character_id: 'Aster0000000',
  });
  expect(invoke).toHaveBeenNthCalledWith(2, 'character/house/find', {
    character_id: character,
    renting: 'furnace',
    location_id: 'selene_residential',
  });
  expect(invoke).toHaveBeenNthCalledWith(3, 'character/house/sleep', {
    character_id: character,
    max_price: 120,
  });
});

it('sends only the given rental fees, with none as null', async () => {
  const invoke = stubInvoke({
    ok: true,
    schema_version: agentSchemaVersion,
    server_time: '2026-11-08T00:00:00.000Z',
    data: {},
  });

  const prices = ['house', 'prices', '-c', character];

  await execute(
    [
      ...prices,
      '--furnace-fee',
      '30',
      '--workshop-fee',
      '40',
      '--alchemy-fee',
      'none',
      '--guest-fee',
      'none',
    ],
    vi.fn(),
  );
  await execute([...prices, '--guest-fee', '120'], vi.fn());

  expect(invoke).toHaveBeenNthCalledWith(1, 'character/house/prices', {
    character_id: character,
    furnace_fee: 30,
    workshop_fee: 40,
    alchemy_fee: null,
    guest_fee: null,
  });
  expect(invoke).toHaveBeenNthCalledWith(2, 'character/house/prices', {
    character_id: character,
    guest_fee: 120,
  });

  invoke.mockClear();
  for (const args of [prices, [...prices, '--guest-fee', 'off']]) {
    await expect(execute(args, vi.fn())).rejects.toMatchObject({
      code: 'INVALID_ARGUMENTS',
      detail: { help_command: 'clawsaga house prices --help' },
    });
  }

  expect(invoke).not.toHaveBeenCalled();
});

it('sends the house description, and empty text to remove it', async () => {
  const invoke = stubInvoke({
    ok: true,
    schema_version: agentSchemaVersion,
    server_time: '2026-11-08T00:00:00.000Z',
    data: {},
  });

  const describe = ['house', 'describe', '-c', character, '--text'];

  await execute(
    [...describe, 'A quiet cottage.\nWorkbench for rent.'],
    vi.fn(),
  );
  await execute([...describe, ''], vi.fn());

  expect(invoke).toHaveBeenNthCalledWith(1, 'character/house/describe', {
    character_id: character,
    description: 'A quiet cottage.\nWorkbench for rent.',
  });
  expect(invoke).toHaveBeenNthCalledWith(2, 'character/house/describe', {
    character_id: character,
    description: '',
  });
});
