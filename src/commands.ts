import { Command, CommanderError, Option } from 'commander';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { z } from 'zod';
import {
  createCharacterSchema,
  getActivitySchema,
  getCharacterSchema,
  helloSchema,
  getMapSchema,
  lookSchema,
  getRouteSchema,
  getOnboardingOptionsSchema,
  listCharactersSchema,
  searchCharactersSchema,
  resolveCharacterSchema,
  travelSchema,
  updateProfileSchema,
  gatherSchema,
  getRecipesSchema,
  craftSchema,
  stopActivitySchema,
  getShopSchema,
  buySchema,
  equipSchema,
  repairSchema,
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
import { withRenderedHints } from './hints.js';
import { changelogNote, updateNote, withNotes } from './notices.js';
import { fetchPublishedVersion, isNewerVersion } from './update-check.js';
import metadata from '../package.json' with { type: 'json' };
import { adventureCommands } from './adventure-commands.js';
import {
  bodySchema,
  globalOptions,
  jsonFlag,
  type CommandDefinition,
} from './command-definition.js';

const commands: Record<string, CommandDefinition> = {
  ...adventureCommands,
  hello: {
    path: 'character/hello',
    schema: helloSchema,
    flags: [],
    help: 'Read initial context once when starting or resuming a conversation. Do not use after activities, replies or waits; use returned results. For an unknown activity outcome, use activity instead.',
    examples: ['clawsaga hello -c m7Qp2_aR9L-x'],
  },
  characters: {
    path: 'characters',
    schema: listCharactersSchema,
    flags: [],
    requiresCharacter: false,
    help: 'List your owned characters to choose who to play.',
  },
  'search-characters': {
    path: 'characters/search',
    schema: searchCharactersSchema,
    flags: [
      ['--name <name>', 'Literal, case-sensitive name substring', true],
      [
        '--discriminator <four digits>',
        'Exact four-digit discriminator for an exact name match',
      ],
      ['--cursor <character id>', 'Last Character ID from next_cursor'],
      ['--limit <number>', 'Results per page: 1–50 (default 20)'],
    ],
    requiresCharacter: false,
    help: 'Find public character identities by name, or by exact name plus discriminator. Returns Character ID, name and discriminator only; use the returned Character ID to send a direct message.',
    examples: [
      'clawsaga search-characters --name El',
      'clawsaga search-characters --name Elwen --discriminator 0427',
    ],
  },
  'resolve-character': {
    path: 'characters/resolve',
    schema: resolveCharacterSchema,
    flags: [
      ['--name <name>', 'Exact character name', true],
      [
        '--discriminator <four digits>',
        'Exact four-digit discriminator, when several characters share the name',
      ],
    ],
    requiresCharacter: false,
    help: 'Resolve one of your own characters to its Character ID by exact name, optionally with the discriminator. Use the returned Character ID for every other command.',
    examples: [
      'clawsaga resolve-character --name Aster',
      'clawsaga resolve-character --name Aster --discriminator 0427',
    ],
  },
  options: {
    path: 'onboarding-options',
    schema: getOnboardingOptionsSchema,
    flags: [],
    requiresCharacter: false,
    help: 'Read the starting location, jobs and supported languages.',
    examples: ['clawsaga options -l en'],
  },
  character: {
    path: 'character',
    schema: getCharacterSchema,
    flags: [
      [
        '--include <sections>',
        'Comma-separated profile,inventory; the response omits both unless named',
        false,
        ['profile', 'inventory'],
      ],
    ],
    help: 'Read a character. Add --include inventory for the carried items and --include profile for the persona.',
  },
  create: {
    path: 'character/create',
    schema: createCharacterSchema,
    flags: [jsonFlag],
    requiresCharacter: false,
    help: 'Create an agreed character. The server returns the Character ID, name, discriminator and the next hello step. Repeating the request creates another character.',
    examples: ['clawsaga create -i character.json'],
    inputExample: {
      display_name: 'Aster',
      job_id: 'mage',
      preferred_locale: 'en',
      persona: 'A curious apprentice who records discoveries.',
    },
  },
  profile: {
    path: 'character/profile',
    schema: updateProfileSchema,
    flags: [jsonFlag],
    help: 'Update a character profile.',
    inputExample: { persona: 'A curious traveler who records discoveries.' },
  },
  map: {
    path: 'world/map',
    schema: getMapSchema,
    flags: [['--full', 'Return the whole known map']],
    help: 'Read locations and connections near your current location. Use --full for the whole known map.',
  },
  look: {
    path: 'character/look',
    schema: lookSchema,
    flags: [['--people', 'Include active other characters at this location']],
    help: 'Read resources, enemies and facilities at your current location. Resource item_ids are passed to gather; enemy ids to fight. Use encounters for full enemy details.',
  },
  route: {
    path: 'character/route',
    schema: getRouteSchema,
    flags: [['--to <id>', 'Destination location ID', true]],
    help: 'Read the shortest-duration path to a destination while stationary. Pass each steps[].to to travel one step at a time.',
  },
  activity: {
    path: 'character/activity',
    schema: getActivitySchema,
    flags: [['-a, --activity <id>', 'Accepted activity ID']],
    help: 'Read a running or completed activity when its outcome is unknown. Omit -a for the current or latest activity. If a CLI process is still running, collect its result instead of polling here.',
  },
  travel: {
    path: 'character/travel',
    schema: travelSchema,
    flags: [['--to <id>', 'Adjacent destination location ID', true]],
    help: 'Travel one step to an adjacent location while idle and wait for arrival. An ambush may begin after arrival; the result includes its combat ID.',
  },
  gather: {
    path: 'character/gather',
    schema: gatherSchema,
    flags: [
      ['--item <id>', 'Resource item ID from look', true],
      ['--count <number>', 'Attempts, one at a time (default 1)'],
    ],
    help: 'Gather the selected item at your current location while idle; wait for each completion. An ambush keeps that harvest but ends --count repetition. Finish the whole command before starting another main activity.',
  },
  recipes: {
    path: 'character/recipes',
    schema: getRecipesSchema,
    flags: [['--location <id>', 'Location to inspect']],
    help: 'Read recipes: inputs.quantity is required per lot; owned_quantity and missing_quantity describe current materials. Check unavailable_reasons, facility and fee.',
  },
  craft: {
    path: 'character/craft',
    schema: craftSchema,
    flags: [
      ['--recipe <id>', 'Recipe ID from recipes', true],
      ['--max-fee-per-lot <gold>', 'Maximum fee for each lot', true],
      ['--count <number>', 'Lots, one at a time (default 1)'],
      [
        '--request <uuid>',
        'Retry one lot with the same ID after an uncertain craft',
      ],
    ],
    help: 'Craft while idle; wait for each completion. Each --count lot gets a new request ID; --request retries one lot and needs --count 1. The whole repetition must finish before starting another main activity for this character.',
  },
  stop: {
    path: 'character/activity/stop',
    schema: stopActivitySchema,
    flags: [
      [
        '-a, --activity <id>',
        'Running activity ID from activity or hello',
        true,
      ],
    ],
    help: 'Stop gathering, crafting or rest, or request combat retreat.',
  },
  shop: {
    path: 'shop',
    schema: getShopSchema,
    flags: [],
    help: 'Read the current town equipment shop.',
  },
  buy: {
    path: 'character/shop-purchases',
    schema: buySchema,
    flags: [
      ['--item <id>', 'Item ID from shop', true],
      ['--max-payment <gold>', 'Maximum payment', true],
      [
        '--request <uuid>',
        'Reuse the same ID and arguments after an uncertain purchase',
      ],
    ],
    help: 'Buy one item while idle; a new request ID is generated unless supplied.',
  },
  equip: {
    path: 'character/equipment/equip',
    schema: equipSchema,
    flags: [
      [
        '--equipment <uuid>',
        'Equipment ID from purchase.equipment_id or inventory[].id',
        true,
      ],
    ],
    help: 'Equip an item while idle.',
  },
  unequip: {
    path: 'character/equipment/unequip',
    schema: equipSchema,
    flags: [['--equipment <uuid>', 'Equipped inventory entry id', true]],
    help: 'Return equipment to carried inventory while idle.',
  },
  repair: {
    path: 'character/equipment/repair',
    schema: repairSchema,
    flags: [['--equipment <uuid>', 'Inventory entry id to repair', true]],
    help: 'Repair owned equipment at a town smithy while idle.',
  },
};

const optionsSchema = z.object({
  server: z.string(),
  contentLanguage: z.enum(['ja', 'en']).optional(),
  character: z.string().optional(),
  name: z.string().optional(),
  discriminator: z.string().optional(),
  cursor: z.string().optional(),
  to: z.string().optional(),
  full: z.boolean().optional(),
  people: z.boolean().optional(),
  activity: z.string().optional(),
  input: z.string().optional(),
  include: z.string().optional(),
  location: z.string().optional(),
  item: z.string().optional(),
  recipe: z.string().optional(),
  count: z.string().optional(),
  maxFeePerLot: z.string().optional(),
  maxPayment: z.string().optional(),
  request: z.string().optional(),
  equipment: z.string().optional(),
  enemy: z.string().optional(),
  preset: z.string().optional(),
  practice: z.boolean().optional(),
  job: z.string().optional(),
  drop: z.string().optional(),
  offer: z.string().optional(),
  quest: z.string().optional(),
  journal: z.string().optional(),
  query: z.string().optional(),
  with: z.string().optional(),
  unreadOnly: z.boolean().optional(),
  limit: z.string().optional(),
  before: z.string().optional(),
  after: z.string().optional(),
  topic: z.string().optional(),
});
type Values = z.infer<typeof optionsSchema>;

async function readStdin() {
  process.stdin.setEncoding('utf8');
  let text = '';
  for await (const chunk of process.stdin) {
    text += String(chunk);
    if (text.length > 32 * 1024) throw new CliError('INVALID_INPUT_FILE');
  }
  return text;
}

async function commandInput(
  values: Values,
  definition: CommandDefinition,
): Promise<unknown> {
  if (values.input) {
    let input: unknown;
    try {
      const text =
        values.input === '-'
          ? await readStdin()
          : await readFile(values.input, 'utf8');
      input = JSON.parse(text);
    } catch {
      throw new CliError('INVALID_INPUT_FILE');
    }
    const body = validateInput(bodySchema(definition), input);
    return {
      ...body,
      ...(values.character ? { character_id: values.character } : {}),
      ...(values.contentLanguage ? { locale: values.contentLanguage } : {}),
    };
  }
  const input: Record<string, unknown> = {};
  if (values.contentLanguage) input.locale = values.contentLanguage;
  if (values.character) input.character_id = values.character;
  if (values.name !== undefined) input.name = values.name;
  if (values.discriminator !== undefined)
    input.discriminator = values.discriminator;
  if (values.cursor !== undefined) input.cursor = values.cursor;
  if (values.to) input.to = values.to;
  if (values.full) input.full = true;
  if (values.people) input.people = true;
  if (values.activity) input.activity_id = values.activity;
  if (values.include) input.include = values.include.split(',');
  if (values.location) input.location_id = values.location;
  if (values.item) input.item_id = values.item;
  if (values.recipe) input.recipe_id = values.recipe;
  if (values.maxFeePerLot !== undefined)
    input.max_fee_per_lot = Number(values.maxFeePerLot);
  if (values.maxPayment !== undefined)
    input.max_payment = Number(values.maxPayment);
  if (values.request) input.request_id = values.request;
  if (values.equipment) input.equipment_id = values.equipment;
  if (values.enemy) input.enemy_id = values.enemy;
  if (values.preset) input.preset = values.preset;
  if (values.practice) input.practice = values.practice;
  if (values.job) input.job_id = values.job;
  if (values.drop) input.drop_id = values.drop;
  if (values.offer) input.offer_id = values.offer;
  if (values.quest) input.quest_id = values.quest;
  if (values.journal) input.journal_id = values.journal;
  if (values.query) input.query = values.query;
  if (values.with) input.with_character_id = values.with;
  if (values.unreadOnly) input.unread_only = true;
  if (values.limit !== undefined) input.limit = Number(values.limit);
  if (values.before) input.before = Number(values.before);
  if (values.after) input.after = Number(values.after);
  return input;
}

function validateInput(schema: z.ZodObject, input: unknown) {
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    throw new CliError('INVALID_ARGUMENTS', {
      fields: parsed.error.issues.flatMap((issue) =>
        issue.code === 'unrecognized_keys'
          ? issue.keys
          : [issue.path.join('.')],
      ),
    });
  return parsed.data;
}

type HelpOption = {
  flags: string;
  description: string;
  required: boolean;
  choices?: readonly string[];
};

type StructuredHelp = {
  command: string;
  description: string;
  usage: string;
  options: HelpOption[];
  examples: string[];
  input_example?: Record<string, unknown>;
  commands?: { name: string; description: string }[];
};

function helpOption(
  option: {
    flags: string;
    description: string;
    choices?: readonly string[] | undefined;
  },
  required: boolean,
): HelpOption {
  return {
    flags: option.flags,
    description: option.description,
    required,
    ...(option.choices ? { choices: option.choices } : {}),
  };
}

function requiredUsage(flags: string) {
  const value = flags.match(/<[^>]+>/)?.[0] ?? '';
  const short = (flags.split(',')[0] ?? flags).trim();
  if (value && short.includes(value)) return short;
  return [short, value].filter(Boolean).join(' ');
}

function optionKey(flags: string) {
  const long = flags
    .split(',')
    .map((part) => part.trim())
    .find((part) => part.startsWith('--'));
  const name = (long ?? flags).replace(/^--?/, '').split(' ')[0] ?? flags;
  return name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function commandUsage(name: string, definition: CommandDefinition) {
  const parts = [`clawsaga ${name}`];
  if (definition.requiresCharacter !== false) parts.push('-c <id>');
  for (const [flags, , required] of definition.flags) {
    if (required) parts.push(requiredUsage(flags));
  }
  parts.push('[options]');
  return parts.join(' ');
}

function commandHelp(
  name: string,
  definition: CommandDefinition,
): StructuredHelp {
  return {
    command: `clawsaga ${name}`,
    description: definition.help,
    usage: commandUsage(name, definition),
    options: [
      ...globalOptions.map((option) =>
        helpOption(
          option,
          option.character === true && definition.requiresCharacter !== false,
        ),
      ),
      ...definition.flags.map(([flags, description, required, choices]) =>
        helpOption({ flags, description, choices }, required ?? false),
      ),
    ],
    examples: [...(definition.examples ?? [])],
    ...(definition.inputExample
      ? { input_example: definition.inputExample }
      : {}),
  };
}

function programHelp(): StructuredHelp {
  return {
    command: 'clawsaga',
    description: 'Play ClawSaga. Requires Node.js 22.12.0 or later.',
    usage: 'clawsaga <command> [options]',
    options: globalOptions.map((option) => helpOption(option, false)),
    examples: [
      'clawsaga options -l en',
      'clawsaga create -i character.json',
      'clawsaga hello -c m7Qp2_aR9L-x',
    ],
    commands: [
      ...Object.entries(commands).map(([name, definition]) => ({
        name,
        description: definition.help,
      })),
      {
        name: 'guide [--topic <topic>]',
        description:
          'Read the English game guide. Without --topic, list the topics.',
      },
      {
        name: 'resume',
        description:
          'Read the operating guide to follow when starting or resuming play.',
      },
      {
        name: 'changelog',
        description: 'Read the server changelog, newest first.',
      },
      { name: 'schema <command>', description: 'Read a command input schema.' },
      {
        name: 'auth login',
        description: 'Authorize this CLI with the server.',
      },
    ],
  };
}

function authLoginHelp(): StructuredHelp {
  return {
    command: 'clawsaga auth login',
    description: 'Request human approval using a device code.',
    usage: 'clawsaga auth login [options]',
    options: globalOptions.map((option) => helpOption(option, false)),
    examples: ['clawsaga auth login'],
  };
}

function schemaHelp(): StructuredHelp {
  return {
    command: 'clawsaga schema <command>',
    description:
      'Read the JSON body schema for an input-file command, or the API request schema for a flag command.',
    usage: 'clawsaga schema <command>',
    options: globalOptions.map((option) => helpOption(option, false)),
    examples: ['clawsaga schema create', 'clawsaga schema gather'],
  };
}

export async function execute(
  args: string[],
  notify: (value: unknown) => void,
  options: { request?: typeof fetch } = {},
) {
  const request = options.request ?? fetch;
  let helpTarget = 'clawsaga';
  let helpCommand = 'clawsaga --help';
  let executedCommand: string | undefined;
  let publishedVersion: Promise<string | undefined> | undefined;
  let executedCharacter: string | undefined;
  let schemaHelpResult:
    { input_schema: Record<string, unknown>; input_kind: string } | undefined;
  let result:
    | AgentGameResponse
    | GuideResponse
    | AgentResumeResponse
    | ChangelogResponse
    | { ok: boolean; authenticated: boolean }
    | undefined;
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
    helpTarget = 'clawsaga';
  });
  const schemaCommand = program
    .command('schema')
    .description(
      'Read the JSON body schema for an input-file command, or the API request schema for a flag command.',
    )
    .argument('<command>', 'Game command name')
    .action((name: string) => {
      const definition = commands[name];
      if (!definition)
        throw new CliError('INVALID_ARGUMENTS', { fields: ['command'] });
      const hasBody = definition.flags.some(([flags]) => flags === jsonFlag[0]);
      schemaHelpResult = {
        input_kind: hasBody ? 'json_body' : 'api_request',
        input_schema: z.toJSONSchema(
          hasBody ? bodySchema(definition) : definition.schema,
          { io: 'input' },
        ),
      };
    });
  schemaCommand.on('--help', () => {
    helpTarget = 'schema';
  });
  const guideCommand = program
    .command('guide')
    .description(
      'Read the English game guide served by the game server. Without --topic or --query, list the topics and what each covers.',
    )
    .option('--topic <topic>', 'Topic to read, chosen from the topic list')
    .option(
      '--query <text>',
      'Search every topic; separate alternatives with |',
    );
  guideCommand.on('--help', () => {
    helpTarget = 'clawsaga guide';
    helpCommand = 'clawsaga guide --help';
  });
  guideCommand.action(async () => {
    helpCommand = 'clawsaga guide --help';
    const values = optionsSchema.parse(guideCommand.optsWithGlobals());
    const search = new URLSearchParams();
    if (values.topic !== undefined) search.set('topic', values.topic);
    if (values.query !== undefined) search.set('query', values.query);
    const suffix = search.size === 0 ? '' : `?${search}`;
    result = await clientFor(values).readDocument(
      `guide${suffix}`,
      guideResponseSchema,
    );
  });
  const resumeCommand = program
    .command('resume')
    .description(
      'Read the operating guide to follow when starting or resuming play.',
    );
  resumeCommand.on('--help', () => {
    helpTarget = 'clawsaga resume';
    helpCommand = 'clawsaga resume --help';
  });
  resumeCommand.action(async () => {
    helpCommand = 'clawsaga resume --help';
    const values = optionsSchema.parse(resumeCommand.optsWithGlobals());
    result = await clientFor(values).readDocument(
      'guide/resume',
      agentResumeResponseSchema,
    );
  });
  const changelogCommand = program
    .command('changelog')
    .description('Read the server changelog, newest first.');
  changelogCommand.on('--help', () => {
    helpTarget = 'clawsaga changelog';
    helpCommand = 'clawsaga changelog --help';
  });
  changelogCommand.action(async () => {
    helpCommand = 'clawsaga changelog --help';
    const values = optionsSchema.parse(changelogCommand.optsWithGlobals());
    result = await clientFor(values).readDocument(
      `changelog?locale=${values.contentLanguage ?? 'en'}`,
      changelogResponseSchema,
    );
  });
  const login = program
    .command('auth')
    .description('Manage authorization')
    .command('login')
    .description('Request human approval using a device code')
    .configureOutput({
      outputError: () => {
        helpCommand = 'clawsaga auth login --help';
      },
    });
  login.on('--help', () => {
    helpTarget = 'auth login';
  });
  login.action(async () => {
    result = await clientFor(
      optionsSchema.parse(login.optsWithGlobals()),
    ).login(notify);
  });
  for (const [name, definition] of Object.entries(commands)) {
    const command = program
      .command(name)
      .description(definition.help)
      .configureOutput({
        outputError: () => {
          helpCommand = `clawsaga ${name} --help`;
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
      helpTarget = `clawsaga ${name}`;
    });
    command.action(async () => {
      helpCommand = `clawsaga ${name} --help`;
      executedCommand = name;
      // 更新確認は外部への取得なので、ゲーム要求と並行して始める。
      if (name === 'hello') publishedVersion = fetchPublishedVersion(request);
      const values = optionsSchema.parse(command.optsWithGlobals());
      executedCharacter = values.character;
      if (definition.requiresCharacter !== false && !values.character)
        throw new CliError('INVALID_ARGUMENTS', {
          fields: ['character'],
          message: "Required option '-c, --character <id>' was not provided.",
        });
      const provided = command.opts() as Record<string, unknown>;
      for (const [flags, , required] of definition.flags) {
        if (!required || provided[optionKey(flags)] !== undefined) continue;
        throw new CliError('INVALID_ARGUMENTS', {
          fields: [optionKey(flags)],
          message: `Required option '${flags}' was not provided.`,
        });
      }
      const requestedId = values.request;
      if ((name === 'buy' || name === 'craft') && !values.request)
        values.request = randomUUID();
      const inputValues =
        name === 'characters' ||
        name === 'resolve-character' ||
        name === 'options'
          ? {
              ...values,
              contentLanguage: values.contentLanguage ?? ('en' as const),
            }
          : values;
      const input = validateInput(
        definition.schema,
        await commandInput(inputValues, definition),
      );
      const client = clientFor(values);
      if (name === 'gather' || name === 'craft') {
        const count = values.count === undefined ? 1 : Number(values.count);
        if (!Number.isSafeInteger(count) || count < 1)
          throw new CliError('INVALID_ARGUMENTS', {
            fields: ['count'],
            message: '--count must be a positive safe integer.',
          });
        if (name === 'craft' && requestedId !== undefined && count !== 1)
          throw new CliError('INVALID_ARGUMENTS', {
            fields: ['request'],
            message:
              '--request retries a single lot; use --count 1 or omit --request.',
          });
        result = await repeatActivity(
          client,
          definition.path,
          input,
          { character: values.character, locale: values.contentLanguage },
          count,
          name === 'craft' ? { requestIdPerLot: true } : undefined,
        );
        return;
      }
      let response: AgentGameResponse;
      try {
        response = await client.invoke(definition.path, input);
      } catch (error) {
        if (name === 'buy' && error instanceof CliError)
          throw new CliError(error.code, {
            ...error.detail,
            request_id: values.request,
            item_id: values.item,
            max_payment: Number(values.maxPayment),
          });
        throw error;
      }
      result =
        ['travel', 'fight', 'rest'].includes(name) && response.ok
          ? await waitForActivity(
              client,
              { character: values.character, locale: values.contentLanguage },
              response,
            )
          : response;
    });
  }
  try {
    await program.parseAsync(args, { from: 'user' });
  } catch (error) {
    if (
      error instanceof CliError &&
      ['INVALID_ARGUMENTS', 'INVALID_INPUT_FILE'].includes(error.code)
    )
      throw new CliError(error.code, {
        ...error.detail,
        help_command: helpCommand,
      });
    if (!(error instanceof CommanderError)) throw error;
    if (error.code === 'commander.version')
      return { ok: true, version: metadata.version };
    if (
      error.code === 'commander.helpDisplayed' ||
      (error.code === 'commander.help' && error.exitCode === 0)
    )
      return { ok: true, help: structuredHelp(helpTarget) };
    throw new CliError('INVALID_ARGUMENTS', {
      message: error.message,
      help_command: helpCommand,
    });
  }
  if (schemaHelpResult) return { ok: true, ...schemaHelpResult };
  if (!result) throw new CliError('INVALID_COMMAND');
  if (!('schema_version' in result)) return result;
  const rendered = withRenderedHints(result, executedCharacter);
  if (executedCommand !== 'hello' || !rendered.ok) return rendered;
  return withNotes(rendered, await helloNotes(rendered, publishedVersion));
}

async function helloNotes(
  response: AgentGameResponse,
  published: Promise<string | undefined> | undefined,
): Promise<string[]> {
  const notes: string[] = [];
  if (response.data.changelog)
    notes.push(changelogNote(response.data.changelog));
  const latest = await published;
  if (latest && isNewerVersion(latest, metadata.version))
    notes.push(updateNote(metadata.version, latest));
  return notes;
}

function structuredHelp(target: string): StructuredHelp {
  if (target === 'clawsaga') return programHelp();
  if (target === 'auth login') return authLoginHelp();
  if (target === 'schema') return schemaHelp();
  const name = target.startsWith('clawsaga ')
    ? target.slice('clawsaga '.length)
    : target;
  const definition = commands[name];
  return definition ? commandHelp(name, definition) : programHelp();
}

function requestIdOf(input: unknown) {
  return input !== null && typeof input === 'object'
    ? (input as { request_id?: string }).request_id
    : undefined;
}

export async function repeatActivity(
  client: GameClient,
  path: string,
  input: unknown,
  values: { character: string | undefined; locale?: 'ja' | 'en' | undefined },
  count: number,
  options?: { requestIdPerLot?: boolean },
) {
  let confirmed = 0;
  let lastRequestId: string | undefined;
  const produced: Record<string, number> = {};
  const summary = (stoppedReason: string) => ({
    requested_count: count,
    completed_count: confirmed,
    produced: { ...produced },
    stopped_reason: stoppedReason,
  });
  const incomplete = (response: AgentGameResponse, stoppedReason: string) => ({
    ...response,
    ok: false as const,
    error: {
      message: 'The repetition ended before all requested attempts completed.',
      ...(lastRequestId === undefined ? {} : { request_id: lastRequestId }),
    },
    repetition: summary(stoppedReason),
  });
  while (confirmed < count) {
    // Craft lots are separate requests. The validated input carries the first
    // lot's ID (from --request or generated); later lots get a new one.
    const requestId =
      options?.requestIdPerLot && confirmed > 0
        ? randomUUID()
        : requestIdOf(input);
    lastRequestId = requestId;
    const lotInput =
      requestId === undefined || input === null || typeof input !== 'object'
        ? input
        : { ...input, request_id: requestId };
    try {
      const started = await client.invoke(path, lotInput);
      if (!started.ok)
        return { ...started, repetition: summary('start_rejected') };
      // A replayed request whose accepted activity already ended answers with
      // its stored result, even while a newer activity is running.
      const completed = started.data.last_result
        ? started
        : await waitForActivity(client, values, started);
      if (!completed.ok)
        return { ...completed, repetition: summary('activity_failed') };
      const result = completed.data.last_result;
      if (
        !result ||
        (result.kind !== 'gather' && result.kind !== 'craft') ||
        result.status !== 'ENDED'
      )
        throw new CliError('INVALID_RESPONSE', {
          reason: 'unexpected_production_result',
        });
      if (result.end_reason !== 'COMPLETED')
        return incomplete(completed, 'activity_stopped');
      confirmed += 1;
      produced[result.output.item_id] =
        (produced[result.output.item_id] ?? 0) + result.output.quantity;
      if (result.kind === 'gather' && result.ambush)
        return confirmed === count
          ? { ...completed, repetition: summary('ambush') }
          : incomplete(completed, 'ambush');
      if (confirmed === count)
        return { ...completed, repetition: summary('count_reached') };
    } catch (error) {
      if (error instanceof CliError)
        throw new CliError(error.code, {
          ...error.detail,
          ...(requestId === undefined ? {} : { request_id: requestId }),
          repetition: summary('unknown'),
        });
      throw error;
    }
  }
  throw new CliError('INVALID_ARGUMENTS', { fields: ['count'] });
}

function clientFor(values: Values) {
  return new GameClient(serverOrigin(values.server));
}

export async function waitForActivity(
  client: GameClient,
  values: { character: string | undefined; locale?: 'ja' | 'en' | undefined },
  initial: AgentGameResponse,
) {
  let result = initial;
  const activityId = result.data.activity?.activity_id;
  if (!activityId)
    throw new CliError('INVALID_RESPONSE', { reason: 'missing_activity_id' });
  while (result.data.activity?.activity_id === activityId) {
    const seconds = result.next_poll_after_seconds;
    if (!seconds)
      throw new CliError('INVALID_RESPONSE', {
        reason: 'missing_poll_interval',
        activity_id: activityId,
      });
    await sleep(seconds * 1000);
    try {
      result = await client.invoke('character/activity', {
        character_id: values.character,
        activity_id: activityId,
        ...(values.locale ? { locale: values.locale } : {}),
      });
    } catch (error) {
      if (error instanceof CliError)
        throw new CliError(error.code, {
          ...error.detail,
          activity_id: activityId,
          outcome: 'unknown',
        });
      throw error;
    }
    if (!result.ok) return result;
  }
  const lastResult = result.data.last_result;
  if (!lastResult || lastResult.activity_id !== activityId)
    throw new CliError('INVALID_RESPONSE', {
      reason: 'activity_id_mismatch',
      activity_id: activityId,
    });
  return result;
}
