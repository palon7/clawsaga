import { afterEach, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { agentSchemaVersion, type AgentGameResponse } from './protocol.js';
import { initial } from './test-responses.js';
import { GameClient } from './client.js';
import { execute } from './commands.js';
import { commands } from './command-registry.js';

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
    return Promise.resolve({
      ok: true,
      authenticated: false,
      verification_uri: `${this.origin}/oauth/device?user_code=ABCD1234`,
      user_code: 'ABCD1234',
    });
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

it('accepts a reusable one-battle tactic file and rejects fight inputs the CLI cannot build', async () => {
  const invoke = vi
    .spyOn(GameClient.prototype, 'invoke')
    .mockResolvedValue(initial);
  const tactic = {
    rules: [
      {
        conditions: [{ kind: 'enemy_recovering' }],
        action: { kind: 'attack' },
      },
    ],
    potion_limit: 0,
  };
  vi.mocked(readFile).mockResolvedValue(
    JSON.stringify({ enemy_id: 'wolf', tactic }),
  );
  await execute(
    ['fight', '-c', 'Traveler0000', '--input', 'fight.json', '--no-wait'],
    vi.fn(),
  );
  expect(invoke).toHaveBeenCalledWith('character/combat/start', {
    character_id: 'Traveler0000',
    enemy_id: 'wolf',
    tactic,
  });
  vi.mocked(readFile).mockResolvedValue(JSON.stringify({ tactic }));
  await execute(
    [
      'fight',
      '-c',
      'Traveler0000',
      '--input',
      'fight.json',
      '--enemy',
      'boar',
      '--no-wait',
    ],
    vi.fn(),
  );
  expect(invoke).toHaveBeenLastCalledWith('character/combat/start', {
    character_id: 'Traveler0000',
    enemy_id: 'boar',
    tactic,
  });
  for (const flags of [['--preset', 'safe'], ['--practice']])
    await expect(
      execute(
        ['fight', '-c', 'Traveler0000', '--input', 'fight.json', ...flags],
        vi.fn(),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENTS' });
  vi.mocked(readFile).mockResolvedValue(JSON.stringify({ tactic }));
  await expect(
    execute(['fight', '-c', 'Traveler0000', '--input', 'fight.json'], vi.fn()),
  ).rejects.toMatchObject({ code: 'INVALID_ARGUMENTS' });
  expect(invoke).toHaveBeenCalledTimes(2);
  expect(await execute(['schema', 'fight'], vi.fn())).toMatchObject({
    input_schema: { properties: { tactic: expect.any(Object) } },
  });
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
  const login = vi.spyOn(GameClient.prototype, 'login').mockResolvedValue({
    ok: true,
    authenticated: false,
    verification_uri: 'https://example.com/oauth/device?user_code=ABCD1234',
    user_code: 'ABCD1234',
  });
  const invoke = vi
    .spyOn(GameClient.prototype, 'invoke')
    .mockResolvedValue(initial);
  vi.stubEnv('CLAWSAGA_SERVER', 'https://example.com');
  expect(await execute(['auth', 'login'], vi.fn())).toMatchObject({
    ok: true,
    authenticated: false,
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

it('emits no upper limit in any command schema', async () => {
  for (const name of Object.keys(commands)) {
    const result = await execute(['schema', name], vi.fn());
    const schema = JSON.stringify(result);
    expect(schema, name).not.toMatch(/"maxLength"|"maxItems"/);
    for (const match of schema.matchAll(/"maximum":(\d+)/g))
      expect(Number(match[1]), name).toBe(Number.MAX_SAFE_INTEGER);
  }
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
      await execute(shellArguments(example), vi.fn());
      checked += 1;
    }
  }

  expect(checked).toBeGreaterThan(0);
  expect(invoke).toHaveBeenCalledTimes(checked);
});

// Help examples are written to be pasted into a shell, so a quoted argument
// arrives without its quotes. Strip that one quoting form before running them.
function shellArguments(example: string) {
  return example
    .slice('clawsaga '.length)
    .split(' ')
    .map((argument) =>
      argument.startsWith("'") && argument.endsWith("'")
        ? argument.slice(1, -1)
        : argument,
    );
}

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

it('maps stack and individual discard flags', async () => {
  const invoke = vi
    .spyOn(GameClient.prototype, 'invoke')
    .mockResolvedValue(initial);
  await execute(
    ['discard', '-c', 'Traveler0000', '--item', 'wolf_meat', '--quantity', '2'],
    vi.fn(),
  );
  expect(invoke).toHaveBeenLastCalledWith('character/item/discard', {
    character_id: 'Traveler0000',
    target: { kind: 'stack', item_id: 'wolf_meat', quantity: 2 },
  });
  invoke.mockClear();
  const instance = '11111111-1111-4111-8111-111111111111';
  await execute(
    ['discard', '-c', 'Traveler0000', '--instance', instance],
    vi.fn(),
  );
  expect(invoke).toHaveBeenCalledWith('character/item/discard', {
    character_id: 'Traveler0000',
    target: {
      kind: 'individual',
      instance_id: instance,
    },
  });
});

it('sends a value outside the documented enum to the server instead of rejecting it locally', async () => {
  const invoke = vi
    .spyOn(GameClient.prototype, 'invoke')
    .mockResolvedValue(initial);
  await execute(
    [
      'fight',
      '-c',
      'Aster0000000',
      '--enemy',
      'wolf',
      '--preset',
      'reckless',
      '--no-wait',
    ],
    vi.fn(),
  );
  expect(invoke).toHaveBeenCalledWith('character/combat/start', {
    character_id: 'Aster0000000',
    enemy_id: 'wolf',
    preset: 'reckless',
  });
});

it('returns the parser reason and command-specific help without sending a request', async () => {
  const invoke = vi.spyOn(GameClient.prototype, 'invoke');
  for (const [args, reason, usage] of [
    [
      [
        'equip',
        '-c',
        'Traveler0000',
        '--instance',
        '00000000-0000-4000-8000-000000000001',
        '--item',
        'iron_sword',
      ],
      "unknown option '--item'",
      'clawsaga equip',
    ],
    [
      ['equip', '--instance'],
      "option '--instance <uuid>' argument missing",
      'clawsaga equip',
    ],
    [['characters', 'unexpected'], 'too many arguments', 'clawsaga characters'],
    [['schema'], 'missing required argument', 'clawsaga schema'],
    [['guide', '--topic'], 'argument missing', 'clawsaga guide'],
    [['resume', '--unknown'], 'unknown option', 'clawsaga resume'],
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

it('sends JSON examples with the character and locale flags added to the body', async () => {
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
    if (name === 'fight') args.push('--no-wait');
    if (help.help.usage.includes('-c <id>')) args.push('-c', 'Traveler0000');
    await execute(args, vi.fn());
    expect(invoke.mock.lastCall?.[1]).toMatchObject({
      locale: 'ja',
      ...(help.help.usage.includes('-c <id>')
        ? { character_id: 'Traveler0000' }
        : {}),
    });
    const schema = (await execute(['schema', name], vi.fn())) as unknown as {
      input_kind: string;
      input_schema: { properties: object };
    };
    expect(schema.input_kind).toBe('json_body');
    expect(schema.input_schema.properties).not.toHaveProperty('character_id');
    expect(schema.input_schema.properties).not.toHaveProperty('locale');
    checked += 1;
  }
  expect(checked).toBeGreaterThan(0);
  invoke.mockClear();
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

it('sends a journal search with non-BMP text as given', async () => {
  const invoke = vi
    .spyOn(GameClient.prototype, 'invoke')
    .mockResolvedValue(initial);
  await execute(
    ['journal', '-c', 'Traveler0000', '--query', '𠮷野🧙'],
    vi.fn(),
  );
  expect(invoke).toHaveBeenCalledWith('character/journal', {
    character_id: 'Traveler0000',
    query: '𠮷野🧙',
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
  await execute(
    ['look', '-c', 'Traveler0000', '--cursor', 'Nearby000000'],
    vi.fn(),
  );
  expect(invoke).toHaveBeenLastCalledWith('character/look', {
    character_id: 'Traveler0000',
    cursor: 'Nearby000000',
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

it('sends the accepted quest offer', async () => {
  const invoke = vi
    .spyOn(GameClient.prototype, 'invoke')
    .mockResolvedValue(initial);
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

it('maps item, recipe and active quest discovery flags', async () => {
  const invoke = vi
    .spyOn(GameClient.prototype, 'invoke')
    .mockResolvedValue(initial);
  await execute(['items', '-c', 'Traveler0000', '--query', 'MP 回復'], vi.fn());
  await execute(
    ['recipes', '-c', 'Traveler0000', '--skill', 'cooking'],
    vi.fn(),
  );
  await execute(['quests', '-c', 'Traveler0000', '--active-only'], vi.fn());
  expect(invoke.mock.calls).toEqual([
    ['character/items', { character_id: 'Traveler0000', query: 'MP 回復' }],
    [
      'character/recipes',
      { character_id: 'Traveler0000', skill_id: 'cooking' },
    ],
    ['character/quests', { character_id: 'Traveler0000', active_only: true }],
  ]);
});

it('passes item IDs to the server, including definitions unknown to this CLI', async () => {
  const invoke = vi
    .spyOn(GameClient.prototype, 'invoke')
    .mockResolvedValue(initial);
  await execute(['use', '-c', 'Traveler0000', '--item', 'wolf_jerky'], vi.fn());
  expect(invoke).toHaveBeenLastCalledWith('character/item/use', {
    character_id: 'Traveler0000',
    item_id: 'wolf_jerky',
  });
  await execute(
    ['use', '-c', 'Traveler0000', '--item', 'future_tonic'],
    vi.fn(),
  );
  expect(invoke).toHaveBeenLastCalledWith('character/item/use', {
    character_id: 'Traveler0000',
    item_id: 'future_tonic',
  });
});

it('sends use --count as one request and does not repeat it', async () => {
  const invoke = vi
    .spyOn(GameClient.prototype, 'invoke')
    .mockResolvedValue(initial);
  await execute(
    ['use', '-c', 'Traveler0000', '--item', 'wolf_jerky', '--count', '5'],
    vi.fn(),
  );
  expect(invoke).toHaveBeenCalledTimes(1);
  expect(invoke).toHaveBeenLastCalledWith('character/item/use', {
    character_id: 'Traveler0000',
    item_id: 'wolf_jerky',
    count: 5,
  });
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
    .mockResolvedValue({ guide: { topics: [] } });
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
