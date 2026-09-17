import { afterEach, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import type { AgentGameResponse } from './protocol.js';
import { GameClient } from './client.js';
import { execute, waitForActivity } from './commands.js';
import { CliError } from './errors.js';

vi.mock('node:timers/promises', () => ({
  setTimeout: (delay: number) =>
    new Promise((resolve) => setTimeout(resolve, delay)),
}));
vi.mock('node:fs/promises', () => ({ readFile: vi.fn() }));
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

it('uses one selected origin for authorization and game commands, with explicit arguments taking priority', async () => {
  const origins: string[] = [];
  vi.spyOn(GameClient.prototype, 'login').mockImplementation(function (
    this: GameClient,
  ) {
    origins.push(this.origin);
    return Promise.resolve({ ok: true, authenticated: true });
  });
  vi.spyOn(GameClient.prototype, 'invoke').mockImplementation(function (
    this: GameClient,
  ) {
    origins.push(this.origin);
    return Promise.resolve(initial);
  });
  vi.stubEnv('CLAWSAGA_SERVER', undefined);
  await execute(['characters'], vi.fn());
  vi.stubEnv('CLAWSAGA_SERVER', 'http://localhost:3000');
  await execute(['auth', 'login'], vi.fn());
  await execute(['characters'], vi.fn());
  await execute(['characters', '-s', 'http://127.0.0.1:3000'], vi.fn());
  expect(origins).toEqual([
    'https://clawsaga.net',
    'http://localhost:3000',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ]);
  for (const value of ['', 'not a URL', 'http://clawsaga.net']) {
    vi.stubEnv('CLAWSAGA_SERVER', value);
    await expect(execute(['characters'], vi.fn())).rejects.toMatchObject({
      code: 'INVALID_SERVER',
    });
  }
  expect(origins).toHaveLength(4);
});

it('resolves a named character to a Character ID without -c or a JSON body', async () => {
  const invoke = vi
    .spyOn(GameClient.prototype, 'invoke')
    .mockResolvedValue(initial);
  await execute(['resolve-character', '--name', 'Aster'], vi.fn());
  expect(invoke).toHaveBeenCalledWith('characters/resolve', {
    locale: 'en',
    name: 'Aster',
  });
  await execute(
    ['resolve-character', '--name', 'Aster', '--discriminator', '0427'],
    vi.fn(),
  );
  expect(invoke).toHaveBeenLastCalledWith('characters/resolve', {
    locale: 'en',
    name: 'Aster',
    discriminator: '0427',
  });
});

it('parses nested auth commands and rejects irrelevant or incomplete options before any request', async () => {
  const login = vi
    .spyOn(GameClient.prototype, 'login')
    .mockResolvedValue({ ok: true, authenticated: true });
  const invoke = vi
    .spyOn(GameClient.prototype, 'invoke')
    .mockResolvedValue(initial);
  vi.stubEnv('CLAWSAGA_SERVER', 'https://example.com');
  expect(await execute(['auth', 'login'], vi.fn())).toMatchObject({
    ok: true,
    authenticated: true,
  });
  expect(login).toHaveBeenCalledTimes(1);
  for (const args of [
    ['hello'],
    ['hello', '--character', 'Traveler0000', '--route', 'route'],
    ['hello', '--character'],
    ['hello', '-c'],
    ['hello', '-c', 'Traveler0000', '-r', 'route'],
    ['auth', 'login', '--input', 'settings.json'],
    ['characters', 'unexpected'],
    ['hello', '--character', 'Traveler0000', '--content-language', 'fr'],
  ])
    await expect(execute(args, vi.fn())).rejects.toMatchObject({
      code: 'INVALID_ARGUMENTS',
    });
  expect(invoke).not.toHaveBeenCalled();
});

it('keeps English help available without authorization and separates content language', async () => {
  vi.stubEnv('CLAWSAGA_SERVER', undefined);
  expect(await execute([], vi.fn())).toMatchObject({
    ok: true,
    help: {
      command: 'clawsaga',
      commands: expect.arrayContaining([
        expect.objectContaining({ name: 'hello' }),
      ]),
    },
  });
  const help = await execute(['hello', '--help'], vi.fn());
  expect(help).toMatchObject({
    ok: true,
    help: {
      command: 'clawsaga hello',
      usage: 'clawsaga hello -c <id> [options]',
      options: expect.arrayContaining([
        expect.objectContaining({
          flags: '-c, --character <id>',
          required: true,
        }),
      ]),
    },
  });
  expect(help).not.toHaveProperty('input_schema');
  expect(await execute(['schema', 'hello'], vi.fn())).toMatchObject({
    input_kind: 'api_request',
    input_schema: { required: ['character_id'] },
  });
  const invoke = vi
    .spyOn(GameClient.prototype, 'invoke')
    .mockResolvedValue(initial);
  await execute(
    ['--server', 'https://example.com', 'hello', '--character', 'Traveler0000'],
    vi.fn(),
  );
  expect(invoke).toHaveBeenLastCalledWith('character/hello', {
    character_id: 'Traveler0000',
  });
  await execute(['-c', 'Traveler0000', 'hello'], vi.fn());
  expect(invoke).toHaveBeenLastCalledWith('character/hello', {
    character_id: 'Traveler0000',
  });
  await execute(
    ['hello', '-s', 'https://example.com', '-c', 'Traveler0000', '-l', 'ja'],
    vi.fn(),
  );
  expect(invoke).toHaveBeenLastCalledWith('character/hello', {
    character_id: 'Traveler0000',
    locale: 'ja',
  });
});

it('generates structured help examples from the command definitions without authorization', async () => {
  const createHelp = (await execute(
    ['create', '--help'],
    vi.fn(),
  )) as unknown as {
    help: {
      usage: string;
      examples: string[];
      input_example: Record<string, unknown>;
      options: { flags: string; required: boolean; choices?: string[] }[];
    };
  };
  expect(createHelp.help.usage).toBe('clawsaga create -i <file> [options]');
  expect(createHelp.help.examples).toContain(
    'clawsaga create -i character.json',
  );
  expect(createHelp.help.input_example).toMatchObject({
    preferred_locale: 'en',
  });
  expect(createHelp.help.options).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        flags: '-c, --character <id>',
        required: false,
      }),
      expect.objectContaining({
        flags: '-l, --content-language <language>',
        choices: ['ja', 'en'],
      }),
    ]),
  );
  const schema = await execute(['schema', 'create'], vi.fn());
  expect(schema).toMatchObject({
    input_kind: 'json_body',
    input_schema: { required: expect.arrayContaining(['preferred_locale']) },
  });
  const helloHelp = (await execute(
    ['hello', '--help'],
    vi.fn(),
  )) as unknown as {
    help: { examples: string[] };
  };
  expect(helloHelp.help.examples).toContain('clawsaga hello -c m7Qp2_aR9L-x');
  const routeHelp = (await execute(
    ['route', '--help'],
    vi.fn(),
  )) as unknown as { help: { usage: string } };
  expect(routeHelp.help.usage).toBe(
    'clawsaga route -c <id> --to <id> [options]',
  );
});

it('passes a Character ID that begins with a dash without treating it as an option', async () => {
  const invoke = vi
    .spyOn(GameClient.prototype, 'invoke')
    .mockResolvedValue(initial);
  await execute(['hello', '-c', '-AbC123xyz_9'], vi.fn());
  expect(invoke).toHaveBeenLastCalledWith('character/hello', {
    character_id: '-AbC123xyz_9',
  });
});

it('accepts comma-separated include sections while help lists each choice', async () => {
  const invoke = vi
    .spyOn(GameClient.prototype, 'invoke')
    .mockResolvedValue(initial);
  await execute(
    ['character', '-c', 'Aster0000000', '--include', 'profile,inventory'],
    vi.fn(),
  );
  expect(invoke).toHaveBeenLastCalledWith('character', {
    character_id: 'Aster0000000',
    include: ['profile', 'inventory'],
  });
  const help = (await execute(['character', '--help'], vi.fn())) as unknown as {
    help: { options: { flags: string; choices?: string[] }[] };
  };
  expect(help.help.options).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        flags: '--include <sections>',
        choices: ['profile', 'inventory'],
      }),
    ]),
  );
});

it('rejects a command option value outside its request schema enum', async () => {
  const invoke = vi.spyOn(GameClient.prototype, 'invoke');
  await expect(
    execute(
      [
        'fight',
        '-c',
        'Aster0000000',
        '--enemy',
        'wolf',
        '--preset',
        'reckless',
      ],
      vi.fn(),
    ),
  ).rejects.toMatchObject({ code: 'INVALID_ARGUMENTS' });
  expect(invoke).not.toHaveBeenCalled();
});

it('returns the parser reason and command-specific help without sending a request', async () => {
  const invoke = vi.spyOn(GameClient.prototype, 'invoke');
  for (const [args, reason, usage] of [
    [
      [
        'equip',
        '-c',
        'Traveler0000',
        '--equipment',
        '00000000-0000-4000-8000-000000000001',
        '--item',
        'iron_sword',
      ],
      "unknown option '--item'",
      'clawsaga equip',
    ],
    [
      ['equip', '--equipment'],
      "option '--equipment <uuid>' argument missing",
      'clawsaga equip',
    ],
    [['characters', 'unexpected'], 'too many arguments', 'clawsaga characters'],
    [
      ['auth', 'login', '--input', 'settings.json'],
      "unknown option '--input'",
      'clawsaga auth login',
    ],
  ] as const) {
    await expect(execute([...args], vi.fn())).rejects.toMatchObject({
      code: 'INVALID_ARGUMENTS',
      detail: {
        message: expect.stringContaining(reason),
        help_command: `${usage} --help`,
      },
    });
  }
  await expect(
    execute(['equip', '--item', 'iron_sword'], vi.fn()),
  ).rejects.toMatchObject({
    detail: { help_command: 'clawsaga equip --help' },
  });
  expect(invoke).not.toHaveBeenCalled();
});

it('names the missing required option and points to concise help', async () => {
  const invoke = vi.spyOn(GameClient.prototype, 'invoke');
  await expect(execute(['report'], vi.fn())).rejects.toMatchObject({
    code: 'INVALID_ARGUMENTS',
    detail: {
      message: expect.stringContaining(
        "Required option '-c, --character <id>'",
      ),
      help_command: 'clawsaga report --help',
    },
  });
  expect(invoke).not.toHaveBeenCalled();
});

it('validates JSON examples and keeps character and locale outside the body', async () => {
  const invoke = vi
    .spyOn(GameClient.prototype, 'invoke')
    .mockResolvedValue(initial);
  for (const name of [
    'create',
    'profile',
    'tactics-check',
    'tactics-set',
    'journal-write',
    'end',
    'chat-send',
    'dm-send',
    'plan-set',
  ]) {
    const help = await execute([name, '--help'], vi.fn());
    const inputExample = (help as { help: { input_example: unknown } }).help
      .input_example;
    expect(inputExample).toBeDefined();
    vi.mocked(readFile).mockResolvedValue(JSON.stringify(inputExample));
    const args = [name, '-i', 'body.json', '-l', 'ja'];
    if (name !== 'create') args.push('-c', 'Traveler0000');
    await execute(args, vi.fn());
    expect(invoke.mock.lastCall?.[1]).toMatchObject({
      locale: 'ja',
      ...(name === 'create' ? {} : { character_id: 'Traveler0000' }),
    });
    const schema = await execute(['schema', name], vi.fn());
    expect(schema).toMatchObject({ input_kind: 'json_body' });
    if (!('input_schema' in schema) || !schema.input_schema)
      throw new Error('Expected input schema');
    expect(schema.input_schema.properties).not.toHaveProperty('character_id');
    expect(schema.input_schema.properties).not.toHaveProperty('locale');
  }
  invoke.mockClear();
  for (const extra of [{ character_id: 'SomeoneElse0' }, { locale: 'en' }]) {
    vi.mocked(readFile).mockResolvedValue(
      JSON.stringify({ text: '', language: 'en', ...extra }),
    );
    await expect(
      execute(['plan-set', '-c', 'Traveler0000', '-i', 'body.json'], vi.fn()),
    ).rejects.toMatchObject({
      code: 'INVALID_ARGUMENTS',
      detail: {
        fields: Object.keys(extra),
        help_command: 'clawsaga plan-set --help',
      },
    });
  }
  expect(invoke).not.toHaveBeenCalled();
  vi.mocked(readFile).mockResolvedValue(
    JSON.stringify({ text: '', language: 'en' }),
  );
  await execute(['plan-set', '-c', 'Traveler0000', '-i', 'body.json'], vi.fn());
  expect(invoke).toHaveBeenCalledWith('character/plan/update', {
    character_id: 'Traveler0000',
    text: '',
    language: 'en',
  });
});

it('rejects invalid Unicode in journal searches before making a request', async () => {
  const invoke = vi
    .spyOn(GameClient.prototype, 'invoke')
    .mockResolvedValue(initial);
  for (const query of ['\u0000', '\ud800', '\udfff']) {
    await expect(
      execute(['journal', '-c', 'Traveler0000', '--query', query], vi.fn()),
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENTS' });
  }
  expect(invoke).not.toHaveBeenCalled();
  await execute(
    ['journal', '-c', 'Traveler0000', '--query', '𠮷野🧙'],
    vi.fn(),
  );
  expect(invoke).toHaveBeenCalledWith('character/journal', {
    character_id: 'Traveler0000',
    query: '𠮷野🧙',
  });
});

const initial: AgentGameResponse = {
  ok: true,
  schema_version: '3.0',
  locale: 'en',
  server_time: '2026-09-09T00:00:00.000Z',
  next_poll_after_seconds: 5,
  data: {
    activity: {
      kind: 'travel',
      activity_id: '00000000-0000-4000-8000-000000000001',
      from: { id: 'dolgan', name: 'Dolgan', kind: 'town' },
      to: { id: 'openpit', name: 'Open pit', kind: 'field' },
      started_at: '2026-09-09T00:00:00.000Z',
      arrives_at: '2026-09-09T00:00:15.000Z',
      duration_seconds: 15,
      status: 'RUNNING',
    },
  },
};

it('waits the server interval and queries only the accepted activity until completion', async () => {
  vi.useFakeTimers();
  if (initial.data.activity?.kind !== 'travel')
    throw new Error('Expected travel fixture');
  const completed: AgentGameResponse = {
    ...initial,
    data: {
      activity: null,
      last_result: {
        kind: 'travel',
        activity_id: initial.data.activity.activity_id,
        status: 'ENDED',
        end_reason: 'COMPLETED',
        ended_at: '2026-09-09T00:00:15.000Z',
        to: initial.data.activity.to,
      },
    },
  };
  const invoke = vi
    .spyOn(GameClient.prototype, 'invoke')
    .mockResolvedValueOnce(initial)
    .mockResolvedValueOnce({ ...initial, next_poll_after_seconds: 10 })
    .mockResolvedValueOnce(completed);
  const notify = vi.fn();
  const pending = execute(
    ['travel', '-c', 'Traveler0000', '--to', 'openpit', '-l', 'en'],
    notify,
  );
  await vi.advanceTimersByTimeAsync(4999);
  expect(invoke).toHaveBeenCalledTimes(1);
  expect(notify).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(invoke).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(10000);
  expect(await pending).toEqual(completed);
  expect(invoke).toHaveBeenCalledTimes(3);
  expect(notify).not.toHaveBeenCalled();
  expect(invoke).toHaveBeenLastCalledWith('character/activity', {
    character_id: 'Traveler0000',
    activity_id: initial.data.activity!.activity_id,
    locale: 'en',
  });
});

it('sends map scope, look people and route or travel destinations', async () => {
  const invoke = vi
    .spyOn(GameClient.prototype, 'invoke')
    .mockResolvedValue(initial);
  await execute(['map', '-c', 'Traveler0000', '--full'], vi.fn());
  expect(invoke).toHaveBeenLastCalledWith('world/map', {
    character_id: 'Traveler0000',
    full: true,
  });
  await execute(['look', '-c', 'Traveler0000', '--people'], vi.fn());
  expect(invoke).toHaveBeenLastCalledWith('character/look', {
    character_id: 'Traveler0000',
    people: true,
  });
  await execute(['route', '-c', 'Traveler0000', '--to', 'openpit'], vi.fn());
  expect(invoke).toHaveBeenLastCalledWith('character/route', {
    character_id: 'Traveler0000',
    to: 'openpit',
  });
  invoke.mockResolvedValueOnce({
    ...initial,
    ok: false,
    error: { message: 'That destination is not adjacent.' },
  });
  await execute(['travel', '-c', 'Traveler0000', '--to', 'mossway'], vi.fn());
  expect(invoke).toHaveBeenLastCalledWith('character/travel', {
    character_id: 'Traveler0000',
    to: 'mossway',
  });
});

it('stops on lost authorization and preserves the accepted ID without restarting travel', async () => {
  vi.useFakeTimers();
  const invoke = vi
    .spyOn(GameClient.prototype, 'invoke')
    .mockRejectedValue(new CliError('AUTH_REQUIRED'));
  const pending = waitForActivity(
    new GameClient('https://example.com'),
    { character: 'Traveler0000' },
    initial,
  );
  const assertion = expect(pending).rejects.toMatchObject({
    code: 'AUTH_REQUIRED',
    detail: { activity_id: initial.data.activity!.activity_id },
  });
  await vi.advanceTimersByTimeAsync(5000);
  await assertion;
  expect(invoke).toHaveBeenCalledTimes(1);
});

it('reports wait contract failures without resubmitting accepted activities', async () => {
  vi.useFakeTimers();
  const client = new GameClient('https://example.com');
  const invoke = vi.spyOn(client, 'invoke');
  await expect(
    waitForActivity(
      client,
      { character: 'Traveler0000' },
      {
        ...initial,
        next_poll_after_seconds: undefined,
      },
    ),
  ).rejects.toMatchObject({
    code: 'INVALID_RESPONSE',
    detail: {
      reason: 'missing_poll_interval',
      activity_id: initial.data.activity!.activity_id,
    },
  });
  expect(invoke).not.toHaveBeenCalled();

  invoke.mockResolvedValue({ ...initial, data: { activity: null } });
  const mismatched = expect(
    waitForActivity(client, { character: 'Traveler0000' }, initial),
  ).rejects.toMatchObject({
    code: 'INVALID_RESPONSE',
    detail: {
      reason: 'activity_id_mismatch',
      activity_id: initial.data.activity!.activity_id,
    },
  });
  await vi.advanceTimersByTimeAsync(5000);
  await mismatched;
  expect(invoke).toHaveBeenCalledTimes(1);

  invoke.mockClear().mockRejectedValue(
    new CliError('INVALID_RESPONSE', {
      reason: 'invalid_response',
      operation: 'character/activity',
      http_status: 200,
      fields: ['data.activity'],
    }),
  );
  const invalid = expect(
    waitForActivity(client, { character: 'Traveler0000' }, initial),
  ).rejects.toMatchObject({
    code: 'INVALID_RESPONSE',
    detail: {
      reason: 'invalid_response',
      operation: 'character/activity',
      http_status: 200,
      fields: ['data.activity'],
      activity_id: initial.data.activity!.activity_id,
    },
  });
  await vi.advanceTimersByTimeAsync(5000);
  await invalid;
  expect(invoke).toHaveBeenCalledTimes(1);
});

it('waits for an accepted fight and returns a cancellation without starting another battle', async () => {
  vi.useFakeTimers();
  const battle: AgentGameResponse = {
    ...initial,
    next_poll_after_seconds: 10,
    data: {
      activity: {
        kind: 'combat',
        activity_id: '00000000-0000-4000-8000-000000000002',
        enemy_id: 'wolf',
        enemy_name: 'Wolf',
        practice: true,
        started_at: initial.server_time,
        time_limit_at: '2026-09-09T00:08:00.000Z',
        next_update_at: '2026-09-09T00:00:10.000Z',
        duration_seconds: 480,
        status: 'RUNNING',
        hp: 120,
        max_hp: 120,
        mp: 100,
        enemy_hp: 120,
        enemy_max_hp: 120,
        retreat_ticks: 0,
        retreat_requested_tick: null,
      },
    },
  };
  const cancelled: AgentGameResponse = {
    ...initial,
    data: {
      activity: null,
      last_result: {
        kind: 'combat',
        activity_id: battle.data.activity!.activity_id,
        status: 'ENDED',
        end_reason: 'CANCELLED',
        ended_at: '2026-09-09T00:00:10.000Z',
        summary: null,
      },
    },
  };
  const invoke = vi
    .spyOn(GameClient.prototype, 'invoke')
    .mockResolvedValueOnce(battle)
    .mockResolvedValueOnce(cancelled);
  const pending = execute(
    [
      'fight',
      '-c',
      'Traveler0000',
      '--enemy',
      'wolf',
      '--practice',
      '--preset',
      'safe',
    ],
    vi.fn(),
  );
  await vi.advanceTimersByTimeAsync(9999);
  expect(invoke).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(await pending).toEqual(cancelled);
  expect(invoke.mock.calls).toEqual([
    [
      'character/combat/start',
      {
        character_id: 'Traveler0000',
        enemy_id: 'wolf',
        practice: true,
        preset: 'safe',
      },
    ],
    [
      'character/activity',
      {
        character_id: 'Traveler0000',
        activity_id: battle.data.activity!.activity_id,
      },
    ],
  ]);
});

it('validates quest identifiers and cursors before sending requests', async () => {
  const invoke = vi
    .spyOn(GameClient.prototype, 'invoke')
    .mockResolvedValue(initial);
  for (const args of [
    ['quest-claim', '-c', 'Traveler0000', '--quest', 'not-a-uuid'],
    ['quests', '-c', 'Traveler0000', '--before', '1.5'],
    ['quest-accept', '-c', 'Traveler0000'],
  ]) {
    await expect(execute(args, vi.fn())).rejects.toMatchObject({
      code: 'INVALID_ARGUMENTS',
    });
  }
  expect(invoke).not.toHaveBeenCalled();
  await execute(
    [
      'quest-accept',
      '-c',
      'Traveler0000',
      '--offer',
      '11111111-1111-4111-8111-111111111111',
    ],
    vi.fn(),
  );
  expect(invoke).toHaveBeenCalledWith('character/quests/accept', {
    character_id: 'Traveler0000',
    offer_id: '11111111-1111-4111-8111-111111111111',
  });
});

it('uses cooked recovery foods and rejects raw ingredients before sending', async () => {
  const invoke = vi
    .spyOn(GameClient.prototype, 'invoke')
    .mockResolvedValue(initial);
  await execute(['use', '-c', 'Traveler0000', '--item', 'wolf_jerky'], vi.fn());
  expect(invoke).toHaveBeenLastCalledWith('character/item/use', {
    character_id: 'Traveler0000',
    item_id: 'wolf_jerky',
  });
  invoke.mockClear();
  for (const item_id of ['wolf_meat', 'food', 'herb']) {
    await expect(
      execute(['use', '-c', 'Traveler0000', '--item', item_id], vi.fn()),
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENTS' });
  }
  expect(invoke).not.toHaveBeenCalled();
});
