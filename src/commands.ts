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
import { localeSchema } from './protocol/ids.js';
import { GameClient, serverOrigin } from './client.js';
import { CliError, invalidArguments } from './errors.js';
import { recoveryHint, withRenderedHints } from './hints.js';
import { announcementNote, changelogNote, withNotes } from './notices.js';
import { updateCli } from './update.js';
import metadata from '../package.json' with { type: 'json' };
import {
  notSent,
  repeatActivity,
  waitForActivity,
  walkRoute,
} from './activity-wait.js';
import { locationIdSchema } from './protocol/movement.js';
import {
  bodySchema,
  jsonFlag,
  type CommandDefinition,
} from './command-definition.js';
import { commandInput, optionsSchema, type Values } from './command-input.js';
import { commands } from './command-registry.js';
import { guideQueryOption, guideTopicOption, structuredHelp } from './help.js';
import { withCliResumeInstructions } from './resume.js';

type Notify = (value: unknown) => void;

type CommandResult =
  | { ok: true; version: string }
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
  schemaHelpResult?: {
    input_schema: Record<string, unknown>;
    input_kind: string;
  };
  result?: CommandResult;
};

function clientFor(values: Values) {
  return new GameClient(serverOrigin(values.server));
}

export async function execute(args: string[], notify: Notify) {
  const run: Run = { helpTarget: 'clawsaga', helpCommand: 'clawsaga --help' };
  const program = createProgram(run, notify);
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
  if (error.code === 'commander.version') {
    return { ok: true, version: metadata.version };
  }

  if (
    error.code === 'commander.helpDisplayed' ||
    (error.code === 'commander.help' && error.exitCode === 0)
  ) {
    return { ok: true, help: structuredHelp(run.helpTarget) };
  }

  throw new CliError('INVALID_ARGUMENTS', {
    message: error.message,
    help_command: run.helpCommand,
  });
}

function commandOutput(run: Run) {
  if (run.schemaHelpResult) return { ok: true, ...run.schemaHelpResult };
  const { result, executed } = run;
  if (!result) throw new CliError('INVALID_COMMAND');
  if (!isGameResponse(result)) return result;

  const rendered = withRenderedHints(result, executed?.character, {
    wait: executed?.wait ?? true,
  });

  if (executed?.name !== 'hello' || !rendered.ok) return rendered;

  return withNotes(rendered, helloNotes(rendered));
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

function helloNotes(response: AgentGameResponse): string[] {
  const notes: string[] = [];
  if (response.data.announcement) {
    notes.push(announcementNote(response.data.announcement));
  }

  if (response.data.changelog) {
    notes.push(changelogNote(response.data.changelog));
  }

  return notes;
}

function createProgram(run: Run, notify: Notify) {
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
      ).choices(localeSchema.options),
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

  program
    .command('update')
    .description('Install the latest CLI with npm')
    .on('--help', () => {
      run.helpTarget = 'clawsaga update';
    })
    .action(async () => {
      run.result = { ok: true, version: await updateCli() };
    });

  addSchemaCommand(program, run);
  addDocumentCommands(program, run);
  for (const [name, definition] of Object.entries(commands)) {
    addGameCommand(program, run, notify, name, definition);
  }

  return program;
}

/**
 * Points a failure of this command, from commander or its action, at
 * `helpCommand`, and `--help` at the structured help of `target`.
 */
function trackHelp(
  command: Command,
  run: Run,
  target: string,
  helpCommand: string,
) {
  command
    .configureOutput({
      outputError: () => {
        run.helpCommand = helpCommand;
      },
    })
    .on('--help', () => {
      run.helpTarget = target;
    })
    .hook('preAction', () => {
      run.helpCommand = helpCommand;
    });
}

function addSchemaCommand(program: Command, run: Run) {
  const schemaCommand = program
    .command('schema')
    .description(
      'Read the local input structure for a command. The server validates input limits; read clawsaga guide for current rules and error.fields when input is rejected.',
    )
    .argument('<command>', 'Game command name')
    .action((name: string) => {
      const definition = commands[name];
      if (!definition) {
        throw invalidArguments(
          ['command'],
          'Choose a game command from clawsaga --help, then run clawsaga schema <command>.',
        );
      }

      const hasBody = definition.flags.some(([flags]) => flags === jsonFlag[0]);
      run.schemaHelpResult = {
        input_kind: hasBody ? 'json_body' : 'api_request',
        input_schema: z.toJSONSchema(
          hasBody ? bodySchema(definition) : definition.schema,
          { io: 'input' },
        ),
      };
    });

  trackHelp(schemaCommand, run, 'schema', 'clawsaga schema --help');
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
    schema: agentResumeResponseSchema.transform(withCliResumeInstructions),
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
      .description(document.description);

    for (const option of document.options) {
      command.option(option.flags, option.description);
    }

    const target = `clawsaga ${document.name}`;
    trackHelp(command, run, target, `${target} --help`);
    command.action(async () => {
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
    .description('Return a device verification URL without waiting');

  trackHelp(login, run, 'auth login', 'clawsaga auth login --help');
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
  name: string,
  definition: CommandDefinition,
) {
  const command = program.command(name).description(definition.help);

  for (const [flags, description] of definition.flags) {
    command.option(flags, description);
  }

  if (definition.inputExample) {
    command.addHelpText(
      'after',
      `\nJSON body: use input_example below with your own content. Full schema: clawsaga schema ${name}.`,
    );
  }

  trackHelp(command, run, `clawsaga ${name}`, `clawsaga ${name} --help`);
  command.action(async () => {
    const executed: ExecutedCommand = {
      name,
      definition,
      character: undefined,
      wait: true,
    };

    run.executed = executed;

    const values = optionsSchema.parse(command.optsWithGlobals());
    executed.character = values.character;
    executed.wait = values.wait !== false;
    assertRequiredOptions(definition, values, command.opts());
    const route = definition.walksRoute ? routeLocations(values) : undefined;

    const requestedId = values.request;
    if (definition.autoRequestId && !values.request) {
      values.request = randomUUID();
    }

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

    if (route) {
      run.result = await walkRoute(
        client,
        definition.path,
        input,
        activityValues(values),
        route,
        notify,
      );

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
  if (definition.requiresCharacter !== false && !values.character) {
    throw invalidArguments(
      ['character'],
      "Required option '-c, --character <id>' was not provided.",
    );
  }

  for (const [flags, , required] of definition.flags) {
    const key = new Option(flags).attributeName();
    if (!required || provided[key] !== undefined) continue;
    throw invalidArguments(
      [key],
      `Required option '${flags}' was not provided.`,
    );
  }
}

async function invokeGame(
  client: GameClient,
  definition: CommandDefinition,
  input: Record<string, unknown>,
  values: Values,
) {
  try {
    return await client.invoke(definition.path, input);
  } catch (error) {
    // A failed request reports the request_id it sent, so an exact retry can
    // reuse it even when the CLI generated it.
    if (definition.autoRequestId && error instanceof CliError) {
      throw new CliError(error.code, {
        ...error.detail,
        request_id: input.request_id,
        ...definition.errorContext?.(values, input),
      });
    }

    throw error;
  }
}

/**
 * The locations of a comma-separated `--to`, or undefined for one location,
 * which travels as before. The server checks each step's destination.
 */
function routeLocations(values: Values) {
  const route = values.to?.split(',') ?? [];
  if (route.length < 2) return undefined;

  if (!route.every((id) => locationIdSchema.safeParse(id).success)) {
    throw invalidArguments(
      ['to'],
      '--to takes location IDs separated by commas, without spaces or empty entries.',
    );
  }

  if (values.wait === false) {
    throw invalidArguments(
      ['to'],
      '--no-wait starts one step; give one location with --to or omit --no-wait.',
    );
  }

  return route;
}

function repeatCount(
  requestIdPerLot: boolean,
  values: Values,
  requestedId: string | undefined,
) {
  const count = values.count === undefined ? 1 : Number(values.count);
  if (!Number.isSafeInteger(count) || count < 1) {
    throw invalidArguments(
      ['count'],
      '--count must be a positive safe integer.',
    );
  }

  if (requestIdPerLot && requestedId !== undefined && count !== 1) {
    throw invalidArguments(
      ['request'],
      '--request retries a single lot; use --count 1 or omit --request.',
    );
  }

  if (values.wait === false && count !== 1) {
    throw invalidArguments(
      ['count'],
      '--no-wait starts one activity; use --count 1 or omit --count.',
    );
  }

  return count;
}
