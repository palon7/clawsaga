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
  getItemsSchema,
  getRecipesSchema,
  craftSchema,
  stopActivitySchema,
  getShopSchema,
  buySchema,
  equipSchema,
  repairSchema,
  discardItemSchema,
  getStorageSchema,
  searchStorageSchema,
  depositItemsSchema,
  withdrawItemsSchema,
  agentResumeResponseSchema,
  changelogResponseSchema,
  guideResponseSchema,
  type AgentGameResponse,
  type AgentRunningActivity,
  type AgentResumeResponse,
  type ChangelogResponse,
  type GuideResponse,
} from './protocol.js';
import { GameClient, serverOrigin } from './client.js';
import { CliError } from './errors.js';
import {
  recoveryHint,
  withRenderedHints,
  type RepetitionSummary,
} from './hints.js';
import { changelogNote, updateNote, withNotes } from './notices.js';
import { fetchPublishedVersion, isNewerVersion } from './update-check.js';
import metadata from '../package.json' with { type: 'json' };
import { adventureCommands } from './adventure-commands.js';
import {
  bodySchema,
  globalOptions,
  jsonFlag,
  noWaitFlag,
  type CommandDefinition,
} from './command-definition.js';

const commands: Record<string, CommandDefinition> = {
  ...adventureCommands,
  hello: {
    path: 'character/hello',
    schema: helloSchema,
    flags: [],
    help: 'Read initial context once per session. During play, use returned results; use activity for an unknown activity outcome.',
    examples: ['clawsaga hello -c m7Qp2_aR9L-x'],
  },
  characters: {
    path: 'characters',
    schema: listCharactersSchema,
    flags: [],
    requiresCharacter: false,
    help: 'List your characters.',
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
    help: 'Find characters by name, or exact name plus discriminator. Returns public IDs and names; use the Character ID for DMs.',
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
    help: 'Find your character by exact name, adding the discriminator if needed. Use the returned Character ID in other commands.',
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
        'Comma-separated profile,inventory,repair_estimates; repair estimates also include inventory',
        false,
        ['profile', 'inventory', 'repair_estimates'],
      ],
    ],
    help: 'Read character status, capacity and rest estimate. Use --include for inventory, repair estimates or persona.',
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
    help: 'Update persona or preferred_locale. Omitted fields stay unchanged; an empty persona clears it.',
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
    flags: [['--people', 'Include other active characters at this location']],
    help: 'Read local resources, enemies and facilities. Use resource item_id for gather and enemy id for fight. Town enemies require --practice. Use encounters for full enemy details.',
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
    flags: [
      ['--to <id>', 'Adjacent destination location ID', true],
      noWaitFlag,
    ],
    help: 'Travel one step to an adjacent location while idle and wait for arrival. An ambush may begin after arrival; the result includes its combat ID.',
    examples: [
      'clawsaga travel -c m7Qp2_aR9L-x --to openpit',
      'clawsaga travel -c m7Qp2_aR9L-x --to openpit --no-wait',
    ],
  },
  gather: {
    path: 'character/gather',
    schema: gatherSchema,
    flags: [
      ['--item <id>', 'Resource item ID from look', true],
      ['--count <number>', 'Attempts, one at a time (default 1)'],
      noWaitFlag,
    ],
    help: 'Gather the selected item at your current location while idle; wait for each completion. An ambush keeps that harvest but ends --count repetition. Finish the whole command before starting another main activity.',
    examples: [
      'clawsaga gather -c m7Qp2_aR9L-x --item herb --count 3',
      'clawsaga gather -c m7Qp2_aR9L-x --item herb --no-wait',
    ],
  },
  recipes: {
    path: 'character/recipes',
    schema: getRecipesSchema,
    flags: [
      ['--location <id>', 'Location used for a recipe detail estimate'],
      [
        '--skill <id>',
        'Filter the recipe list by required skill',
        false,
        [
          'mining',
          'gathering',
          'smithing',
          'crafting',
          'alchemy',
          'cooking',
          'enchanting',
        ],
      ],
      ['--recipe <id>', 'Read one recipe in detail'],
    ],
    help: 'List recipe IDs, outputs and skill requirements, or use --recipe for materials, shortages, fee, duration, facility, availability and output effects.',
  },
  items: {
    path: 'character/items',
    schema: getItemsSchema,
    flags: [
      ['--query <text>', 'Search IDs, names, descriptions, effects and stats'],
      ['--item <id>', 'Read one public item definition'],
    ],
    help: 'List public items, search with normalized AND terms, or read one item in detail. Search is independent of inventory ownership.',
  },
  craft: {
    path: 'character/craft',
    schema: craftSchema,
    flags: [
      ['--recipe <id>', 'Recipe ID from recipes', true],
      [
        '--max-fee-per-lot <gold>',
        'Refuse a lot whose gold fee is above this. Omit it to accept the fee the recipe lists',
      ],
      ['--count <number>', 'Lots, one at a time (default 1)'],
      [
        '--request <uuid>',
        'Retry one lot with the same ID after an uncertain craft',
      ],
      noWaitFlag,
    ],
    help: 'Craft goods from standard-quality materials while idle; wait for each lot. Each lot gets a new request ID. To retry one uncertain lot, keep its recipe and fee limit and use --request with --count 1. Wait for the whole command before starting another activity.',
    examples: [
      'clawsaga craft -c m7Qp2_aR9L-x --recipe wolf_jerky --count 3',
      'clawsaga craft -c m7Qp2_aR9L-x --recipe metal_ingot --max-fee-per-lot 2 --no-wait',
    ],
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
    help: 'Stop gathering, crafting or rest, or request combat retreat. Travel continues until arrival.',
  },
  shop: {
    path: 'shop',
    schema: getShopSchema,
    flags: [],
    help: 'Read the shop and available stock in your current town.',
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
        '--instance <uuid>',
        'Item instance ID from purchase.instance_id or inventory[].instance_id',
        true,
      ],
    ],
    help: 'Equip an item while idle.',
  },
  unequip: {
    path: 'character/equipment/unequip',
    schema: equipSchema,
    flags: [
      [
        '--instance <uuid>',
        'Item instance ID from inventory[].instance_id',
        true,
      ],
    ],
    help: 'Return equipment to carried inventory while idle.',
  },
  repair: {
    path: 'character/equipment/repair',
    schema: repairSchema,
    flags: [
      [
        '--instance <uuid>',
        'Item instance ID from inventory[].instance_id',
        true,
      ],
    ],
    help: 'Repair owned equipment with standard-quality kits at a town smithy while idle.',
  },
  discard: {
    path: 'character/item/discard',
    schema: discardItemSchema,
    flags: [
      ['--item <id>', 'Stack item ID from inventory'],
      ['--quantity <number>', 'Stack quantity to discard'],
      ['--instance <uuid>', 'Item instance ID from inventory'],
    ],
    help: 'Permanently discard a standard-quality stack quantity or one item instance while idle.',
    examples: [
      'clawsaga discard -c m7Qp2_aR9L-x --item wolf_meat --quantity 10',
      'clawsaga discard -c m7Qp2_aR9L-x --instance 00000000-0000-4000-8000-000000000001',
    ],
  },
  storage: {
    path: 'character/storage',
    schema: getStorageSchema,
    flags: [['--town <id>', 'Town location ID', true]],
    help: 'Read your storage in one town from anywhere: items, weight and capacity. Unused storage is empty.',
    examples: ['clawsaga storage -c m7Qp2_aR9L-x --town selene'],
  },
  'search-storage': {
    path: 'character/storage/search',
    schema: searchStorageSchema,
    flags: [
      [
        '--query <text>',
        'Exact item ID or a case-insensitive substring of the item name',
        true,
      ],
    ],
    help: 'Find an item across every town storage you own, grouped by town. No match returns an empty list.',
    examples: ['clawsaga search-storage -c m7Qp2_aR9L-x --query ore'],
  },
  deposit: {
    path: 'character/storage/deposit',
    schema: depositItemsSchema,
    flags: [
      ['--town <id>', 'Town location ID where you stand', true],
      ['--items <json>', 'JSON array of stack and individual targets', true],
      [
        '--request <uuid>',
        'Retry with the same ID, town and items after an uncertain deposit',
      ],
    ],
    help: 'Deposit items while idle in that town. The entire --items array succeeds or fails together. A request ID is generated unless supplied.',
    examples: [
      'clawsaga deposit -c m7Qp2_aR9L-x --town selene --items \'[{"kind":"stack","item_id":"ore","quality":"standard","quantity":10}]\'',
    ],
  },
  withdraw: {
    path: 'character/storage/withdraw',
    schema: withdrawItemsSchema,
    flags: [
      ['--town <id>', 'Town location ID where you stand', true],
      ['--items <json>', 'JSON array of stack and individual targets', true],
      [
        '--request <uuid>',
        'Retry with the same ID, town and items after an uncertain withdrawal',
      ],
    ],
    help: 'Withdraw items while idle in that town. The entire --items array succeeds or fails together. A request ID is generated unless supplied.',
    examples: [
      'clawsaga withdraw -c m7Qp2_aR9L-x --town selene --items \'[{"kind":"individual","instance_id":"00000000-0000-4000-8000-000000000001"}]\'',
    ],
  },
};

// The commands that start a main activity and therefore accept --no-wait.
const activityCommands = new Set([
  'travel',
  'gather',
  'craft',
  'fight',
  'rest',
]);

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
  skill: z.string().optional(),
  count: z.string().optional(),
  quantity: z.string().optional(),
  maxFeePerLot: z.string().optional(),
  maxPayment: z.string().optional(),
  request: z.string().optional(),
  wait: z.boolean().optional(),
  instance: z.string().optional(),
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
  activeOnly: z.boolean().optional(),
  limit: z.string().optional(),
  before: z.string().optional(),
  beforeThread: z.string().optional(),
  after: z.string().optional(),
  topic: z.string().optional(),
  category: z.string().optional(),
  threadLanguage: z.string().optional(),
  authoredBySelf: z.boolean().optional(),
  participatedBySelf: z.boolean().optional(),
  thread: z.string().optional(),
  town: z.string().optional(),
  items: z.string().optional(),
});
type Values = z.infer<typeof optionsSchema>;

async function readStdin() {
  process.stdin.setEncoding('utf8');
  let text = '';
  for await (const chunk of process.stdin) {
    text += String(chunk);
    // ゲーム経路のJSON本文の境界に合わせる。10,000コードポイントの本文を
    // 最悪のエスケープで送っても収まる。無制限にはしない。
    if (text.length > 128 * 1024) throw new CliError('INVALID_INPUT_FILE');
  }
  return text;
}

async function commandInput(
  values: Values,
  definition: CommandDefinition,
  commandName: string,
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
  if (commandName === 'discard') {
    const stack = values.item !== undefined || values.quantity !== undefined;
    const individual = values.instance !== undefined;
    if (stack !== individual)
      input.target = stack
        ? {
            kind: 'stack',
            item_id: values.item,
            quantity: Number(values.quantity),
          }
        : {
            kind: 'individual',
            instance_id: values.instance,
          };
    return input;
  }
  if (values.item) input.item_id = values.item;
  if (values.recipe) input.recipe_id = values.recipe;
  if (values.skill) input.skill_id = values.skill;
  if (values.maxFeePerLot !== undefined)
    input.max_fee_per_lot = Number(values.maxFeePerLot);
  if (values.maxPayment !== undefined)
    input.max_payment = Number(values.maxPayment);
  if (values.request) input.request_id = values.request;
  if (values.instance) input.instance_id = values.instance;
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
  if (values.activeOnly) input.active_only = true;
  if (values.limit !== undefined) input.limit = Number(values.limit);
  if (values.before) input.before = Number(values.before);
  if (values.beforeThread) input.before = values.beforeThread;
  if (values.after) input.after = Number(values.after);
  if (values.category) input.category = values.category;
  if (values.threadLanguage) input.language = values.threadLanguage;
  if (values.authoredBySelf) input.authored_by_self = true;
  if (values.participatedBySelf) input.participated_by_self = true;
  if (values.thread) input.thread_id = values.thread;
  if (values.town) input.town_id = values.town;
  if (commandName === 'deposit' || commandName === 'withdraw') {
    input.items = parseItemTargets(values.items);
  }
  return input;
}

// The storage batch is one JSON array option. The request schema validates its
// elements after parsing, so a malformed array is reported as invalid arguments.
function parseItemTargets(value: string | undefined) {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    throw new CliError('INVALID_ARGUMENTS', { fields: ['items'] });
  }
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

const guideTopicOption = {
  flags: '--topic <topic>',
  description: 'Return one topic body at guide.section.body',
};
const guideQueryOption = {
  flags: '--query <text>',
  description:
    'Search every topic for |-separated alternatives; returns excerpts at guide.matches',
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
        name: 'guide [--topic <topic>] [--query <text>]',
        description:
          'Read the game guide. Without --topic or --query, list the topics.',
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

function guideHelp(): StructuredHelp {
  return {
    command: 'clawsaga guide',
    description:
      'Read the game guide. With no option, guide.topics lists the topics. --topic returns its Markdown body at guide.section.body; get_guide returns the same body at data.guide.section.body. --query returns excerpts at guide.matches. Topic and query responses omit topics.',
    usage: 'clawsaga guide [options]',
    options: [
      ...globalOptions.map((option) => helpOption(option, false)),
      helpOption(guideTopicOption, false),
      helpOption(guideQueryOption, false),
    ],
    examples: [
      'clawsaga guide',
      'clawsaga guide --topic travel-production',
      'clawsaga guide --query "ambush|potion"',
    ],
  };
}

function authLoginHelp(): StructuredHelp {
  return {
    command: 'clawsaga auth login',
    description:
      'Return a device verification URL for human approval without waiting.',
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
  let executedWait = true;
  let executedActivity = false;
  let schemaHelpResult:
    { input_schema: Record<string, unknown>; input_kind: string } | undefined;
  let result:
    | AgentGameResponse
    | GuideResponse
    | AgentResumeResponse
    | ChangelogResponse
    | {
        ok: boolean;
        authenticated: boolean;
        verification_uri: string;
        user_code: string;
      }
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
      'Read the game guide served by the game server. Without --topic or --query, list the topics and what each covers.',
    )
    .option(guideTopicOption.flags, guideTopicOption.description)
    .option(guideQueryOption.flags, guideQueryOption.description);
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
    .description('Return a device verification URL without waiting')
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
    ).login();
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
      executedWait = values.wait !== false;
      executedActivity = activityCommands.has(name);
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
      if (
        (name === 'buy' ||
          name === 'craft' ||
          name === 'deposit' ||
          name === 'withdraw') &&
        !values.request
      )
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
        await commandInput(inputValues, definition, name),
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
        if (!executedWait && count !== 1)
          throw new CliError('INVALID_ARGUMENTS', {
            fields: ['count'],
            message:
              '--no-wait starts one activity; use --count 1 or omit --count.',
          });
        if (!executedWait) {
          try {
            result = await client.invoke(definition.path, input);
          } catch (error) {
            if (name === 'craft' && error instanceof CliError)
              throw new CliError(error.code, {
                ...error.detail,
                request_id: values.request,
              });
            throw error;
          }
          return;
        }
        result = await repeatActivity(
          client,
          definition.path,
          input,
          { character: values.character, locale: values.contentLanguage },
          count,
          name === 'craft' ? { requestIdPerLot: true, notify } : { notify },
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
        if (
          (name === 'deposit' || name === 'withdraw') &&
          error instanceof CliError
        )
          throw new CliError(error.code, {
            ...error.detail,
            request_id: values.request,
            town_id: values.town,
          });
        throw error;
      }
      result =
        activityCommands.has(name) && response.ok && executedWait
          ? await waitForActivity(
              client,
              { character: values.character, locale: values.contentLanguage },
              response,
              notify,
            )
          : response;
    });
  }
  try {
    await program.parseAsync(args, { from: 'user' });
  } catch (error) {
    if (error instanceof CliError) {
      const help = ['INVALID_ARGUMENTS', 'INVALID_INPUT_FILE'].includes(
        error.code,
      )
        ? { help_command: helpCommand }
        : {};
      // 主活動の応答が読めない場合も、サーバーは受付済みかもしれない。
      // 送信前の失敗は除き、受付応答を失った場合と同じ復旧手順を返す。
      const detail =
        executedActivity &&
        !notSent(error) &&
        (error.code === 'INVALID_RESPONSE' ||
          error.code === 'UPDATE_REQUIRED' ||
          error.code === 'SERVICE_UNAVAILABLE')
          ? { ...error.detail, outcome: 'unknown' }
          : error.detail;
      // A thrown error never reaches withRenderedHints, so carry the recovery
      // guidance in the failure envelope itself.
      const hint = recoveryHint(detail, {
        character: executedCharacter,
        activity: executedActivity,
        craft: executedCommand === 'craft',
      });
      if (Object.keys(help).length === 0 && !hint) throw error;
      throw new CliError(error.code, {
        ...detail,
        ...help,
        ...(hint ? { hint } : {}),
      });
    }
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
  const rendered = withRenderedHints(result, executedCharacter, {
    wait: executedWait,
  });
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
  if (target === 'clawsaga guide') return guideHelp();
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

// invoke marks a failure that happened before the game request was sent, so the
// start cannot have taken effect.
function notSent(error: CliError) {
  return error.detail.outcome === 'not_sent';
}

// 受付診断。ホストがCLIを終了させても、この行から活動を再開せず回収できる。
function acceptedActivityNote(
  activity: AgentRunningActivity,
  nextPollAfterSeconds: number | undefined,
  requestId?: string,
) {
  return {
    event: 'activity_accepted',
    activity_id: activity.activity_id,
    kind: activity.kind,
    started_at: activity.started_at,
    ...('completes_at' in activity
      ? { completes_at: activity.completes_at }
      : {}),
    ...('arrives_at' in activity ? { arrives_at: activity.arrives_at } : {}),
    ...('time_limit_at' in activity
      ? { time_limit_at: activity.time_limit_at }
      : {}),
    ...(nextPollAfterSeconds === undefined
      ? {}
      : { next_poll_after_seconds: nextPollAfterSeconds }),
    ...(requestId === undefined ? {} : { request_id: requestId }),
  };
}

export async function repeatActivity(
  client: GameClient,
  path: string,
  input: unknown,
  values: { character: string | undefined; locale?: 'ja' | 'en' | undefined },
  count: number,
  options?: {
    requestIdPerLot?: boolean;
    notify?: (value: unknown) => void;
  },
) {
  let confirmed = 0;
  let lastRequestId: string | undefined;
  const produced: Record<string, number> = {};
  const summary = (stoppedReason: string): RepetitionSummary => ({
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
        : await waitForActivity(
            client,
            values,
            started,
            options?.notify,
            requestId,
          );
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
          // 送信前の失敗は開始していないため、成果があった可能性を主張しない。
          repetition: summary(notSent(error) ? 'start_rejected' : 'unknown'),
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
  notify?: (value: unknown) => void,
  requestId?: string,
) {
  let result = initial;
  const activity = result.ok ? result.data.activity : undefined;
  if (!activity)
    throw new CliError('INVALID_RESPONSE', { reason: 'missing_activity_id' });
  const activityId = activity.activity_id;
  notify?.(
    acceptedActivityNote(activity, result.next_poll_after_seconds, requestId),
  );
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
