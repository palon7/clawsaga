import { afterEach, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { agentSchemaVersion, type AgentGameResponse } from './protocol.js';
import { GameClient } from './client.js';
import { execute, waitForActivity } from './commands.js';
import { CliError } from './errors.js';

vi.mock('node:timers/promises', () => ({
  setTimeout: (delay: number) =>
    new Promise((resolve) => setTimeout(resolve, delay)),
}));
vi.mock('node:fs/promises', () => ({ readFile: vi.fn() }));
// 更新確認は公開リポジトリへ取りに行くため、単体試験では必ず失敗させて無効化する。
vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));
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

it('parses every structured help command example with a fake client', async () => {
  const failure: AgentGameResponse = {
    ok: false,
    schema_version: agentSchemaVersion,
    server_time: '2026-09-20T00:00:00.000Z',
    data: {},
    error: { message: 'Fixture response.' },
  };
  const invoke = vi
    .spyOn(GameClient.prototype, 'invoke')
    .mockResolvedValue(failure);
  const program = (await execute([], vi.fn())) as unknown as {
    help: { commands: { name: string }[] };
  };
  const special = new Set([
    'guide [--topic <topic>] [--query <text>]',
    'resume',
    'changelog',
    'schema <command>',
    'auth login',
  ]);
  let checked = 0;

  for (const { name } of program.help.commands) {
    if (special.has(name)) continue;
    const result = (await execute([name, '--help'], vi.fn())) as unknown as {
      help: { examples: string[]; input_example?: Record<string, unknown> };
    };
    for (const example of result.help.examples) {
      expect(example.startsWith('clawsaga ')).toBe(true);
      if (result.help.input_example)
        vi.mocked(readFile).mockResolvedValue(
          JSON.stringify(result.help.input_example),
        );
      await execute(example.slice('clawsaga '.length).split(' '), vi.fn());
      checked += 1;
    }
  }

  expect(checked).toBeGreaterThan(0);
  expect(invoke).toHaveBeenCalledTimes(checked);
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
        choices: ['profile', 'inventory', 'repair_estimates'],
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
  const program = (await execute([], vi.fn())) as unknown as {
    help: { commands: { name: string }[] };
  };
  const special = new Set([
    'guide [--topic <topic>] [--query <text>]',
    'resume',
    'changelog',
    'schema <command>',
    'auth login',
  ]);
  let checked = 0;
  for (const { name } of program.help.commands) {
    if (special.has(name)) continue;
    const help = (await execute([name, '--help'], vi.fn())) as unknown as {
      help: { usage: string; input_example?: Record<string, unknown> };
    };
    const inputExample = help.help.input_example;
    if (!inputExample) continue;
    vi.mocked(readFile).mockResolvedValue(JSON.stringify(inputExample));
    const args = [name, '-i', 'body.json', '-l', 'ja'];
    if (help.help.usage.includes('-c <id>')) args.push('-c', 'Traveler0000');
    await execute(args, vi.fn());
    expect(invoke.mock.lastCall?.[1]).toMatchObject({
      locale: 'ja',
      ...(help.help.usage.includes('-c <id>')
        ? { character_id: 'Traveler0000' }
        : {}),
    });
    const schema = await execute(['schema', name], vi.fn());
    expect(schema).toMatchObject({ input_kind: 'json_body' });
    if (!('input_schema' in schema) || !schema.input_schema)
      throw new Error('Expected input schema');
    expect(schema.input_schema.properties).not.toHaveProperty('character_id');
    expect(schema.input_schema.properties).not.toHaveProperty('locale');
    checked += 1;
  }
  expect(checked).toBeGreaterThan(0);
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
  schema_version: agentSchemaVersion,
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
  expect(notify).toHaveBeenCalledTimes(1);
  expect(notify).toHaveBeenCalledWith({
    event: 'activity_accepted',
    activity_id: initial.data.activity!.activity_id,
    kind: 'travel',
    started_at: '2026-09-09T00:00:00.000Z',
    arrives_at: '2026-09-09T00:00:15.000Z',
    next_poll_after_seconds: 5,
  });
  await vi.advanceTimersByTimeAsync(1);
  expect(invoke).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(10000);
  expect(await pending).toEqual(completed);
  expect(invoke).toHaveBeenCalledTimes(3);
  expect(notify).toHaveBeenCalledTimes(1);
  expect(invoke).toHaveBeenLastCalledWith('character/activity', {
    character_id: 'Traveler0000',
    activity_id: initial.data.activity!.activity_id,
    locale: 'en',
  });
});

it('returns one acceptance for --no-wait travel, fight and rest without polling or a wait input', async () => {
  const invoke = vi
    .spyOn(GameClient.prototype, 'invoke')
    .mockResolvedValue(initial);
  const notify = vi.fn();
  const travel = await execute(
    ['travel', '-c', 'Traveler0000', '--to', 'openpit', '--no-wait'],
    notify,
  );
  expect(travel).toMatchObject({ ok: true, data: initial.data });
  expect(invoke).toHaveBeenCalledTimes(1);
  expect(invoke).toHaveBeenLastCalledWith('character/travel', {
    character_id: 'Traveler0000',
    to: 'openpit',
  });
  await execute(
    ['fight', '-c', 'Traveler0000', '--enemy', 'wolf', '--no-wait'],
    notify,
  );
  expect(invoke).toHaveBeenLastCalledWith('character/combat/start', {
    character_id: 'Traveler0000',
    enemy_id: 'wolf',
  });
  await execute(['rest', '-c', 'Traveler0000', '--no-wait'], notify);
  expect(invoke).toHaveBeenLastCalledWith('character/rest', {
    character_id: 'Traveler0000',
  });
  // 開始1回ずつ。活動照会もstderr診断も出さない。
  expect(invoke).toHaveBeenCalledTimes(3);
  expect(notify).not.toHaveBeenCalled();
});

it('points an unknown accepted start at the current or latest activity', async () => {
  vi.spyOn(GameClient.prototype, 'invoke').mockRejectedValue(
    new CliError('NETWORK_ERROR', { outcome: 'unknown' }),
  );
  const error = await execute(
    ['travel', '-c', 'Traveler0000', '--to', 'openpit'],
    vi.fn(),
  ).catch((thrown: unknown) => thrown);
  if (!(error instanceof CliError)) throw new Error('Expected a CliError');
  const hint = String(error.detail.hint);
  expect(error.code).toBe('NETWORK_ERROR');
  expect(hint).toContain('may have produced output');
  expect(hint).toContain('activity -c Traveler0000');
  expect(hint).toContain('match its kind and time');
  expect(hint).toContain('ambiguous');
  // The activity ID is unknown, so the hint must not pin one with -a.
  expect(hint).not.toMatch(/-a /);
});

it('recovers a main activity whose start response could not be read', async () => {
  vi.spyOn(GameClient.prototype, 'accessToken').mockResolvedValue('test-token');
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        new Response('private upstream details', { status: 200 }),
      ),
    ),
  );
  const travel = await execute(
    ['travel', '-c', 'Traveler0000', '--to', 'openpit'],
    vi.fn(),
  ).catch((thrown: unknown) => thrown);
  if (!(travel instanceof CliError)) throw new Error('Expected a CliError');
  // 応答が読めなくてもサーバーは受付済みかもしれないため、結果不明として扱う。
  expect(travel.code).toBe('INVALID_RESPONSE');
  expect(travel.detail.outcome).toBe('unknown');
  const hint = String(travel.detail.hint);
  expect(hint).toContain('may have produced output');
  expect(hint).toContain('activity -c Traveler0000');
  // The activity ID is unknown, so the hint must not pin one with -a.
  expect(hint).not.toMatch(/-a /);

  // A read keeps its own diagnostics; only a main activity gets the step.
  const map = await execute(['map', '-c', 'Traveler0000'], vi.fn()).catch(
    (thrown: unknown) => thrown,
  );
  if (!(map instanceof CliError)) throw new Error('Expected a CliError');
  expect(map.code).toBe('INVALID_RESPONSE');
  expect(map.detail).not.toHaveProperty('outcome');
  expect(map.detail).not.toHaveProperty('hint');
});

it('recovers a main activity whose start returned 503', async () => {
  vi.spyOn(GameClient.prototype, 'accessToken').mockResolvedValue('test-token');
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(null, { status: 503 }))),
  );
  const error = await execute(
    ['travel', '-c', 'Traveler0000', '--to', 'openpit'],
    vi.fn(),
  ).catch((thrown: unknown) => thrown);
  if (!(error instanceof CliError)) throw new Error('Expected a CliError');
  expect(error).toMatchObject({
    code: 'SERVICE_UNAVAILABLE',
    detail: { outcome: 'unknown' },
  });
  expect(error.detail.hint).toContain('activity -c Traveler0000');
});

it('recovers a main activity whose response has a newer server schema', async () => {
  const [major = 0, minor = 0] = agentSchemaVersion.split('.').map(Number);
  vi.spyOn(GameClient.prototype, 'accessToken').mockResolvedValue('test-token');
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        Response.json({
          ok: true,
          schema_version: `${major}.${minor + 1}`,
          server_time: '2026-09-19T00:00:00.000Z',
          data: {},
        }),
      ),
    ),
  );
  const travel = await execute(
    ['travel', '-c', 'Traveler0000', '--to', 'openpit'],
    vi.fn(),
  ).catch((thrown: unknown) => thrown);
  if (!(travel instanceof CliError)) throw new Error('Expected a CliError');
  // 更新した後に開始し直すのではなく、受付済みかもしれない活動を先に照合する。
  expect(travel.code).toBe('UPDATE_REQUIRED');
  expect(travel.detail).toMatchObject({
    operation: 'character/travel',
    http_status: 200,
    outcome: 'unknown',
  });
  const hint = String(travel.detail.hint);
  expect(hint).toContain('may have produced output');
  expect(hint).toContain('activity -c Traveler0000');
  // The activity ID is unknown, so the hint must not pin one with -a.
  expect(hint).not.toMatch(/-a /);

  // A read keeps its own diagnostics; only a main activity gets the step.
  const map = await execute(['map', '-c', 'Traveler0000'], vi.fn()).catch(
    (thrown: unknown) => thrown,
  );
  if (!(map instanceof CliError)) throw new Error('Expected a CliError');
  expect(map.code).toBe('UPDATE_REQUIRED');
  expect(map.detail).not.toHaveProperty('outcome');
  expect(map.detail).not.toHaveProperty('hint');
});

it('does not offer activity recovery when the start was never sent', async () => {
  const request = vi.fn();
  vi.stubGlobal('fetch', request);
  vi.spyOn(GameClient.prototype, 'accessToken').mockRejectedValue(
    new CliError('INVALID_RESPONSE'),
  );
  const error = await execute(
    ['travel', '-c', 'Traveler0000', '--to', 'openpit'],
    vi.fn(),
  ).catch((thrown: unknown) => thrown);
  if (!(error instanceof CliError)) throw new Error('Expected a CliError');
  expect(error.code).toBe('INVALID_RESPONSE');
  // 送信前の失敗はゲームを変えていないため、結果不明の復旧手順を付けない。
  expect(error.detail.outcome).not.toBe('unknown');
  expect(error.detail).not.toHaveProperty('hint');
  expect(request).not.toHaveBeenCalled();
});

it('lists the --no-wait option and example in structured help', async () => {
  const help = (await execute(['travel', '--help'], vi.fn())) as unknown as {
    help: { options: { flags: string }[]; examples: string[] };
  };
  expect(help.help.options).toEqual(
    expect.arrayContaining([expect.objectContaining({ flags: '--no-wait' })]),
  );
  expect(help.help.examples).toContain(
    'clawsaga travel -c m7Qp2_aR9L-x --to openpit --no-wait',
  );
  // The wait choice is local; the game request schema never carries it.
  const schema = (await execute(['schema', 'travel'], vi.fn())) as unknown as {
    input_schema: { properties: Record<string, unknown> };
  };
  expect(schema.input_schema.properties).not.toHaveProperty('wait');
  expect(schema.input_schema.properties).not.toHaveProperty('no_wait');
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

it('reads the server changelog without a character', async () => {
  const read = vi
    .spyOn(GameClient.prototype, 'readDocument')
    .mockResolvedValue({
      locale: 'en',
      changelog: { entries: [], next_cursor: null },
    });
  expect(await execute(['changelog'], vi.fn())).toMatchObject({
    locale: 'en',
    changelog: { entries: [], next_cursor: null },
  });
  expect(read).toHaveBeenCalledWith('changelog?locale=en', expect.anything());
});

it('adds the changelog and update notices to hello only', async () => {
  const hello: AgentGameResponse = {
    ...initial,
    data: {
      ...initial.data,
      changelog: { published_at: '2026-09-18', title: 'Rest tuning' },
    },
  };
  const invoke = vi
    .spyOn(GameClient.prototype, 'invoke')
    .mockResolvedValue(hello);
  const request = (() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ version: '9.9.9' }),
    })) as unknown as typeof fetch;

  expect(
    await execute(['hello', '-c', 'Traveler0000'], vi.fn(), { request }),
  ).toMatchObject({
    hints: [
      { note: expect.stringContaining('Rest tuning') },
      { note: expect.stringContaining('npx skills update clawsaga') },
    ],
  });

  // 見出しを返しても、hello以外の応答には案内を足さない。
  invoke.mockResolvedValue(hello);
  expect(await execute(['characters'], vi.fn(), { request })).toEqual(hello);
});

it('keeps hello quiet when the published version is not newer', async () => {
  vi.spyOn(GameClient.prototype, 'invoke').mockResolvedValue(initial);
  const request = (() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ version: '0.1.7' }),
    })) as unknown as typeof fetch;
  const result = await execute(['hello', '-c', 'Traveler0000'], vi.fn(), {
    request,
  });
  expect(result).not.toHaveProperty('hints');
});

it('reads the guide index, one topic or a search from the document route', async () => {
  const read = vi
    .spyOn(GameClient.prototype, 'readDocument')
    .mockResolvedValue({ guide: { topics: [] } } as never);
  await execute(['guide'], vi.fn());
  expect(read).toHaveBeenLastCalledWith('guide', expect.anything());
  await execute(['guide', '--topic', 'overview'], vi.fn());
  expect(read).toHaveBeenLastCalledWith(
    'guide?topic=overview',
    expect.anything(),
  );
  await execute(['guide', '--query', 'ambush|potion'], vi.fn());
  expect(read).toHaveBeenLastCalledWith(
    'guide?query=ambush%7Cpotion',
    expect.anything(),
  );

  expect(await execute(['guide', '--help'], vi.fn())).toMatchObject({
    ok: true,
    help: {
      command: 'clawsaga guide',
      description: expect.stringMatching(
        /guide\.topics.*guide\.section\.body.*data\.guide\.section\.body/,
      ),
      options: expect.arrayContaining([
        expect.objectContaining({ flags: '--topic <topic>' }),
        expect.objectContaining({ flags: '--query <text>' }),
      ]),
    },
  });
});
