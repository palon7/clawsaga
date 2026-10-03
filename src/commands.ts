import { Command, CommanderError, Option } from 'commander';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  agentResumeResponseSchema,
  changelogResponseSchema,
  guideResponseSchema,
  type AgentGameResponse,
  type AgentResumeResponse,
  type ChangelogResponse,
  type GuideResponse,
} from './protocol.js';
import { GameClient, serverOrigin } from './client.js';
import { CliError } from './errors.js';
import { recoveryHint, withRenderedHints } from './hints.js';
import {
  announcementNote,
  changelogNote,
  updateNote,
  withNotes,
} from './notices.js';
import { fetchPublishedVersion, isNewerVersion } from './update-check.js';
import metadata from '../package.json' with { type: 'json' };
import { notSent, repeatActivity, waitForActivity } from './activity-wait.js';
import {
  bodySchema,
  jsonFlag,
  type CommandDefinition,
} from './command-definition.js';
import {
  commandInput,
  optionKey,
  optionsSchema,
  type Values,
} from './command-input.js';
import { commands } from './command-registry.js';
import { guideQueryOption, guideTopicOption, structuredHelp } from './help.js';

type Notify = (value: unknown) => void;

type CommandResult =
  | AgentGameResponse
  | GuideResponse
  | AgentResumeResponse
  | ChangelogResponse
  | {
      ok: boolean;
      authenticated: boolean;
      verification_uri: string;
      user_code: string;
    };

type ExecutedCommand = {
  name: string;
  definition: CommandDefinition;
  character: string | undefined;
  wait: boolean;
};

/** What one `execute` call learns while commander parses and runs the command. */
type Run = {
  helpTarget: string;
  helpCommand: string;
  executed?: ExecutedCommand;
  publishedVersion?: Promise<string | undefined>;
  schemaHelpResult?: {
    input_schema: Record<string, unknown>;
    input_kind: string;
  };
  result?: CommandResult;
};

function clientFor(values: Values) {
  return new GameClient(serverOrigin(values.server));
}

export async function execute(
  args: string[],
  notify: Notify,
  options: { request?: typeof fetch } = {},
) {
  const run: Run = { helpTarget: 'clawsaga', helpCommand: 'clawsaga --help' };
  const program = createProgram(run, notify, options.request ?? fetch);
  try {
    await program.parseAsync(args, { from: 'user' });
  } catch (error) {
    return helpOrFailure(error, run);
  }
  return commandOutput(run);
}

/** Returns the structured version or help result, and throws every failure. */
function helpOrFailure(error: unknown, run: Run) {
  if (error instanceof CliError) throw withRecoveryGuidance(error, run);
  if (!(error instanceof CommanderError)) throw error;
  if (error.code === 'commander.version')
    return { ok: true, version: metadata.version };
  if (
    error.code === 'commander.helpDisplayed' ||
    (error.code === 'commander.help' && error.exitCode === 0)
  )
    return { ok: true, help: structuredHelp(run.helpTarget) };
  throw new CliError('INVALID_ARGUMENTS', {
    message: error.message,
    help_command: run.helpCommand,
  });
}

async function commandOutput(run: Run) {
  if (run.schemaHelpResult) return { ok: true, ...run.schemaHelpResult };
  const { result, executed } = run;
  if (!result) throw new CliError('INVALID_COMMAND');
  if (!isGameResponse(result)) return result;
  const rendered = withRenderedHints(result, executed?.character, {
    wait: executed?.wait ?? true,
  });
  if (executed?.name !== 'hello' || !rendered.ok) return rendered;
  return withNotes(rendered, await helloNotes(rendered, run.publishedVersion));
}

function isGameResponse(result: object): result is AgentGameResponse {
  return 'schema_version' in result;
}

function withRecoveryGuidance(error: CliError, run: Run) {
  const definition = run.executed?.definition;
  const help = ['INVALID_ARGUMENTS', 'INVALID_INPUT_FILE'].includes(error.code)
    ? { help_command: run.helpCommand }
    : {};
  // 主活動・使用・廃棄の応答が読めない場合も、サーバーは受付済みかもしれない。
  // 送信前の失敗は除き、受付応答を失った場合と同じ復旧手順を返す。
  const activity = definition?.startsActivity === true;
  const itemChange = definition?.changesItems === true;
  const detail =
    (activity || itemChange) && isLostResponse(error)
      ? { ...error.detail, outcome: 'unknown' }
      : error.detail;
  // A thrown error never reaches withRenderedHints, so carry the recovery
  // guidance in the failure envelope itself.
  const hint = recoveryHint(detail, {
    character: run.executed?.character,
    activity,
    craft: definition?.repeat?.requestIdPerLot === true,
    itemChange,
  });
  if (Object.keys(help).length === 0 && !hint) return error;
  return new CliError(error.code, {
    ...detail,
    ...help,
    ...(hint ? { hint } : {}),
  });
}

function isLostResponse(error: CliError) {
  return (
    !notSent(error) &&
    (error.code === 'INVALID_RESPONSE' ||
      error.code === 'UPDATE_REQUIRED' ||
      error.code === 'SERVICE_UNAVAILABLE')
  );
}

async function helloNotes(
  response: AgentGameResponse,
  published: Promise<string | undefined> | undefined,
): Promise<string[]> {
  const notes: string[] = [];
  if (response.data.announcement)
    notes.push(announcementNote(response.data.announcement));
  if (response.data.changelog)
    notes.push(changelogNote(response.data.changelog));
  const latest = await published;
  if (latest && isNewerVersion(latest, metadata.version))
    notes.push(updateNote(metadata.version, latest));
  return notes;
}

function createProgram(run: Run, notify: Notify, request: typeof fetch) {
  const program = new Command('clawsaga')
    .description('Play ClawSaga. Requires Node.js 22.12.0 or later.')
    .version(metadata.version)
    .addOption(
      new Option('-s, --server <origin>', 'ClawSaga origin')
        .env('CLAWSAGA_SERVER')
        .default(metadata.homepage),
    )
    .addOption(
      new Option(
        '-l, --content-language <language>',
        'Game content language for this call',
      ).choices(['ja', 'en']),
    )
    .addOption(new Option('-c, --character <id>', 'Character ID'))
    .exitOverride()
    .configureHelp({
      showGlobalOptions: true,
      optionTerm: (option) =>
        `${option.flags}${option.mandatory ? ' (required)' : ''}`,
    })
    .configureOutput({
      writeOut: () => undefined,
      writeErr: () => undefined,
      outputError: () => undefined,
    });
  program.action(() => program.help());
  program.on('--help', () => {
    run.helpTarget = 'clawsaga';
  });
  addSchemaCommand(program, run);
  addDocumentCommands(program, run);
  for (const [name, definition] of Object.entries(commands))
    addGameCommand(program, run, notify, request, name, definition);
  return program;
}

function addSchemaCommand(program: Command, run: Run) {
  const schemaCommand = program
    .command('schema')
    .description(
      'Read the local input structure for a command. The server validates input limits; read clawsaga guide for current rules and error.fields when input is rejected.',
    )
    .argument('<command>', 'Game command name')
    .configureOutput({
      outputError: () => {
        run.helpCommand = 'clawsaga schema --help';
      },
    })
    .action((name: string) => {
      run.helpCommand = 'clawsaga schema --help';
      const definition = commands[name];
      if (!definition)
        throw new CliError('INVALID_ARGUMENTS', {
          fields: ['command'],
          message:
            'Choose a game command from clawsaga --help, then run clawsaga schema <command>.',
        });
      const hasBody = definition.flags.some(([flags]) => flags === jsonFlag[0]);
      run.schemaHelpResult = {
        input_kind: hasBody ? 'json_body' : 'api_request',
        input_schema: z.toJSONSchema(
          hasBody ? bodySchema(definition) : definition.schema,
          { io: 'input' },
        ),
      };
    });
  schemaCommand.on('--help', () => {
    run.helpTarget = 'schema';
  });
}

/** A command that reads a server document and takes no character. */
type DocumentCommand = {
  name: string;
  description: string;
  options: readonly { flags: string; description: string }[];
  path: (values: Values) => string;
  schema: z.ZodType<GuideResponse | AgentResumeResponse | ChangelogResponse>;
};

const documentCommands: readonly DocumentCommand[] = [
  {
    name: 'guide',
    description:
      'Read the game guide served by the game server. Without --topic or --query, list the topics and what each covers.',
    options: [guideTopicOption, guideQueryOption],
    path: (values: Values) => {
      const search = new URLSearchParams();
      if (values.topic !== undefined) search.set('topic', values.topic);
      if (values.query !== undefined) search.set('query', values.query);
      return search.size === 0 ? 'guide' : `guide?${search.toString()}`;
    },
    schema: guideResponseSchema,
  },
  {
    name: 'resume',
    description:
      'Read the operating guide to follow when starting or resuming play.',
    options: [],
    path: () => 'guide/resume',
    schema: agentResumeResponseSchema,
  },
  {
    name: 'changelog',
    description: 'Read the server changelog, newest first.',
    options: [],
    path: (values: Values) =>
      `changelog?locale=${values.contentLanguage ?? 'en'}`,
    schema: changelogResponseSchema,
  },
];

function addDocumentCommands(program: Command, run: Run) {
  for (const document of documentCommands) {
    const command = program
      .command(document.name)
      .description(document.description)
      .configureOutput({
        outputError: () => {
          run.helpCommand = `clawsaga ${document.name} --help`;
        },
      });
    for (const option of document.options)
      command.option(option.flags, option.description);
    command.on('--help', () => {
      run.helpTarget = `clawsaga ${document.name}`;
      run.helpCommand = `clawsaga ${document.name} --help`;
    });
    command.action(async () => {
      run.helpCommand = `clawsaga ${document.name} --help`;
      const values = optionsSchema.parse(command.optsWithGlobals());
      run.result = await clientFor(values).readDocument(
        document.path(values),
        document.schema,
      );
    });
  }
  const login = program
    .command('auth')
    .description('Manage authorization')
    .command('login')
    .description('Return a device verification URL without waiting')
    .configureOutput({
      outputError: () => {
        run.helpCommand = 'clawsaga auth login --help';
      },
    });
  login.on('--help', () => {
    run.helpTarget = 'auth login';
  });
  login.action(async () => {
    run.result = await clientFor(
      optionsSchema.parse(login.optsWithGlobals()),
    ).login();
  });
}

function addGameCommand(
  program: Command,
  run: Run,
  notify: Notify,
  request: typeof fetch,
  name: string,
  definition: CommandDefinition,
) {
  const command = program
    .command(name)
    .description(definition.help)
    .configureOutput({
      outputError: () => {
        run.helpCommand = `clawsaga ${name} --help`;
      },
    });
  for (const [flags, description] of definition.flags) {
    command.option(flags, description);
  }
  if (definition.inputExample)
    command.addHelpText(
      'after',
      `\nJSON body: use input_example below with your own content. Full schema: clawsaga schema ${name}.`,
    );
  command.on('--help', () => {
    run.helpTarget = `clawsaga ${name}`;
  });
  command.action(async () => {
    run.helpCommand = `clawsaga ${name} --help`;
    const executed: ExecutedCommand = {
      name,
      definition,
      character: undefined,
      wait: true,
    };
    run.executed = executed;
    // 更新確認は外部への取得なので、ゲーム要求と並行して始める。
    if (name === 'hello') run.publishedVersion = fetchPublishedVersion(request);
    const values = optionsSchema.parse(command.optsWithGlobals());
    executed.character = values.character;
    executed.wait = values.wait !== false;
    assertRequiredOptions(definition, values, command.opts());
    const requestedId = values.request;
    if (definition.autoRequestId && !values.request)
      values.request = randomUUID();
    const input = await commandInput(definition, values);
    const client = clientFor(values);
    if (definition.repeat) {
      const { requestIdPerLot } = definition.repeat;
      const count = repeatCount(requestIdPerLot, values, requestedId);
      run.result = executed.wait
        ? await repeatActivity(
            client,
            definition.path,
            input,
            activityValues(values),
            count,
            { requestIdPerLot, notify },
          )
        : await invokeGame(client, definition, input, values);
      return;
    }
    const response = await invokeGame(client, definition, input, values);
    run.result =
      definition.startsActivity && response.ok && executed.wait
        ? await waitForActivity(
            client,
            activityValues(values),
            response,
            notify,
          )
        : response;
  });
}

function activityValues(values: Values) {
  return { character: values.character, locale: values.contentLanguage };
}

function assertRequiredOptions(
  definition: CommandDefinition,
  values: Values,
  provided: Record<string, unknown>,
) {
  if (definition.requiresCharacter !== false && !values.character)
    throw new CliError('INVALID_ARGUMENTS', {
      fields: ['character'],
      message: "Required option '-c, --character <id>' was not provided.",
    });
  for (const [flags, , required] of definition.flags) {
    if (!required || provided[optionKey(flags)] !== undefined) continue;
    throw new CliError('INVALID_ARGUMENTS', {
      fields: [optionKey(flags)],
      message: `Required option '${flags}' was not provided.`,
    });
  }
}

async function invokeGame(
  client: GameClient,
  definition: CommandDefinition,
  input: unknown,
  values: Values,
) {
  try {
    return await client.invoke(definition.path, input);
  } catch (error) {
    if (definition.errorContext && error instanceof CliError)
      throw new CliError(error.code, {
        ...error.detail,
        ...definition.errorContext(values),
      });
    throw error;
  }
}

function repeatCount(
  requestIdPerLot: boolean,
  values: Values,
  requestedId: string | undefined,
) {
  const count = values.count === undefined ? 1 : Number(values.count);
  if (!Number.isSafeInteger(count) || count < 1)
    throw new CliError('INVALID_ARGUMENTS', {
      fields: ['count'],
      message: '--count must be a positive safe integer.',
    });
  if (requestIdPerLot && requestedId !== undefined && count !== 1)
    throw new CliError('INVALID_ARGUMENTS', {
      fields: ['request'],
      message:
        '--request retries a single lot; use --count 1 or omit --request.',
    });
  if (values.wait === false && count !== 1)
    throw new CliError('INVALID_ARGUMENTS', {
      fields: ['count'],
      message: '--no-wait starts one activity; use --count 1 or omit --count.',
    });
  return count;
}
