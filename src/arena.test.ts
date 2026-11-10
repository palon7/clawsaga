import { afterEach, expect, it, vi } from 'vitest';
import { execute } from './commands.js';
import { GameClient } from './client.js';
import { stubInvoke } from './test-responses.js';
import { agentSchemaVersion } from './protocol.js';

afterEach(() => vi.restoreAllMocks());

const character = 'm7Qp2_aR9L-x';
const response = {
  ok: true,
  schema_version: agentSchemaVersion,
  server_time: '2026-11-05T00:00:00.000Z',
  data: {},
} as const;

it('lists the arena subcommands without sending a request', async () => {
  const invoke = vi.spyOn(GameClient.prototype, 'invoke');

  expect(await execute(['arena'], vi.fn())).toMatchObject({
    ok: true,
    help: {
      command: 'clawsaga arena',
      commands: [
        { name: 'arena status' },
        { name: 'arena enter' },
        { name: 'arena withdraw' },
        { name: 'arena results' },
      ],
    },
  });
  expect(invoke).not.toHaveBeenCalled();
});

it('sends the tournament number with the results read', async () => {
  const invoke = stubInvoke(response);

  await execute(['arena', 'results', '-c', character], vi.fn());
  await execute(
    ['arena', 'results', '-c', character, '--number', '3'],
    vi.fn(),
  );

  expect(invoke).toHaveBeenNthCalledWith(1, 'character/arena/results', {
    character_id: character,
  });
  expect(invoke).toHaveBeenNthCalledWith(2, 'character/arena/results', {
    character_id: character,
    number: 3,
  });
});
