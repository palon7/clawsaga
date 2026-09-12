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
  getOnboardingOptionsSchema,
  listCharactersSchema,
  travelSchema,
  updateProfileSchema,
  gatherSchema,
  getRecipesSchema,
  craftSchema,
  stopActivitySchema,
  getShopSchema,
  buySchema,
  equipSchema,
  type AgentGameResponse,
} from './protocol.js';
import { GameClient, serverOrigin } from './client.js';
import { CliError } from './errors.js';
import { withCommandHints } from './hints.js';
import metadata from '../package.json' with { type: 'json' };
import { adventureCommands } from './adventure-commands.js';
import {
  bodySchema,
  characterFlag,
  jsonFlag,
  type CommandDefinition,
} from './command-definition.js';

const commands: Record<string, CommandDefinition> = {
  ...adventureCommands,
  hello: {
    path: 'character/hello',
    schema: helloSchema,
    flags: [characterFlag],
    help: 'Read initial context once when starting or resuming a conversation. Do not use after activities, replies or waits; use returned results. For an unknown activity outcome, use activity instead.',
  },
  characters: {
    path: 'characters',
    schema: listCharactersSchema,
    flags: [],
    help: 'List your characters.',
  },
  options: {
    path: 'onboarding-options',
    schema: getOnboardingOptionsSchema,
    flags: [],
    help: 'Read registration options.',
  },
  character: {
    path: 'character',
    schema: getCharacterSchema,
    flags: [
      characterFlag,
      ['--include <sections>', 'Comma-separated profile,inventory'],
    ],
    help: 'Read a character.',
  },
  create: {
    path: 'character/create',
    schema: createCharacterSchema,
    flags: [jsonFlag],
    help: 'Create an agreed character.',
    inputExample: {
      public_id: 'Traveler',
      display_name: 'Traveler',
      job_id: 'mage',
    },
  },
  profile: {
    path: 'character/profile',
    schema: updateProfileSchema,
    flags: [characterFlag, jsonFlag],
    help: 'Update a character profile.',
    inputExample: { persona: 'A curious traveler who records discoveries.' },
  },
  map: {
    path: 'world/map',
    schema: getMapSchema,
    flags: [
      characterFlag,
      ['--location <id>', 'Location whose resources to inspect'],
    ],
    help: 'Read the map and available routes.',
  },
  activity: {
    path: 'character/activity',
    schema: getActivitySchema,
    flags: [characterFlag, ['-a, --activity <id>', 'Accepted activity ID']],
    help: 'Read a running or completed activity when its outcome is unknown. Omit -a for the current or latest activity. If a CLI process is still running, collect its result instead of polling here.',
  },
  travel: {
    path: 'character/travel',
    schema: travelSchema,
    flags: [
      characterFlag,
      ['-r, --route <id>', 'Available route ID from map', true],
    ],
    help: 'Travel one route while idle and wait for arrival. An ambush may begin after arrival; the result includes its combat ID.',
  },
  gather: {
    path: 'character/gather',
    schema: gatherSchema,
    flags: [
      characterFlag,
      ['--item <id>', 'Resource item ID from map', true],
      ['--count <number>', 'Attempts, one at a time (default 1)'],
    ],
    help: 'Gather the selected item at your current location while idle; wait for each completion. An ambush keeps that harvest but ends --count repetition. Finish the whole command before starting another main activity.',
  },
  recipes: {
    path: 'character/recipes',
    schema: getRecipesSchema,
    flags: [characterFlag, ['--location <id>', 'Location to inspect']],
    help: 'Read recipes: inputs.quantity is required per lot; owned_quantity and missing_quantity describe current materials. Check unavailable_reasons, facility and fee.',
  },
  craft: {
    path: 'character/craft',
    schema: craftSchema,
    flags: [
      characterFlag,
      ['--recipe <id>', 'Recipe ID from recipes', true],
      ['--max-fee-per-lot <gold>', 'Maximum fee for each lot', true],
      ['--count <number>', 'Lots, one at a time (default 1)'],
    ],
    help: 'Craft while idle; wait for each completion. The whole --count repetition must finish before starting another main activity for this character.',
  },
  stop: {
    path: 'character/activity/stop',
    schema: stopActivitySchema,
    flags: [
      characterFlag,
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
    flags: [characterFlag],
    help: 'Read the current town equipment shop.',
  },
  buy: {
    path: 'character/shop-purchases',
    schema: buySchema,
    flags: [
      characterFlag,
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
      characterFlag,
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
    flags: [
      characterFlag,
      ['--equipment <uuid>', 'Equipped inventory entry id', true],
    ],
    help: 'Return equipment to carried inventory while idle.',
  },
};

const optionsSchema = z.object({
  server: z.string(),
  contentLanguage: z.enum(['ja', 'en']).optional(),
  character: z.string().optional(),
  route: z.string().optional(),
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
  template: z.string().optional(),
  quest: z.string().optional(),
  journal: z.string().optional(),
  query: z.string().optional(),
  with: z.string().optional(),
  unreadOnly: z.boolean().optional(),
  limit: z.string().optional(),
  before: z.string().optional(),
  after: z.string().optional(),
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
  if (values.route) input.route_id = values.route;
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
  if (values.template) input.template_id = values.template;
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

export async function execute(
  args: string[],
  notify: (value: unknown) => void,
) {
  let help = '';
  let helpExample: Record<string, unknown> | undefined;
  let helpCommand = 'clawsaga --help';
  let executedCommand = '';
  let schemaHelp:
    { input_schema: Record<string, unknown>; input_kind: string } | undefined;
  let result:
    AgentGameResponse | { ok: boolean; authenticated: boolean } | undefined;
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
        'Game content language override',
      ).choices(['ja', 'en']),
    )
    .exitOverride()
    .configureHelp({
      showGlobalOptions: true,
      optionTerm: (option) =>
        `${option.flags}${option.mandatory ? ' (required)' : ''}`,
    })
    .configureOutput({
      writeOut: (text) => {
        help += text;
      },
      writeErr: () => undefined,
      outputError: () => undefined,
    });
  program.action(() => program.help());
  program
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
      schemaHelp = {
        input_kind: hasBody ? 'json_body' : 'api_request',
        input_schema: z.toJSONSchema(
          hasBody ? bodySchema(definition) : definition.schema,
          { io: 'input' },
        ),
      };
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
    for (const [flags, description, required] of definition.flags) {
      if (required) command.requiredOption(flags, description);
      else command.option(flags, description);
    }
    const requiredUsage = command.options
      .filter((option) => option.mandatory)
      .map((option) =>
        `${option.short ?? option.long} ${option.flags.match(/<[^>]+>/)?.[0] ?? ''}`.trim(),
      );
    command.usage([...requiredUsage, '[options]'].join(' '));
    if (definition.inputExample)
      command.addHelpText(
        'after',
        `\nJSON body: use input_example below with your own content. Full schema: clawsaga schema ${name}.`,
      );
    command.on('--help', () => {
      helpExample = definition.inputExample;
    });
    command.action(async () => {
      executedCommand = name;
      helpCommand = `clawsaga ${name} --help`;
      const values = optionsSchema.parse(command.optsWithGlobals());
      if (name === 'buy' && !values.request) values.request = randomUUID();
      const inputValues =
        name === 'characters' || name === 'options'
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
        result = await repeatActivity(
          client,
          definition.path,
          input,
          { character: values.character, locale: values.contentLanguage },
          count,
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
      return {
        ok: true,
        help,
        ...(helpExample ? { input_example: helpExample } : {}),
      };
    throw new CliError('INVALID_ARGUMENTS', {
      message: error.message,
      help_command: helpCommand,
    });
  }
  if (schemaHelp) return { ok: true, ...schemaHelp };
  if (!result) throw new CliError('INVALID_COMMAND');
  return 'schema_version' in result
    ? withCommandHints(executedCommand, result)
    : result;
}

export async function repeatActivity(
  client: GameClient,
  path: string,
  input: unknown,
  values: { character: string | undefined; locale?: 'ja' | 'en' | undefined },
  count: number,
) {
  let confirmed = 0;
  const produced: Record<string, number> = {};
  const summary = () => ({
    requested_count: count,
    completed_count: confirmed,
    produced: { ...produced },
  });
  while (confirmed < count) {
    try {
      const started = await client.invoke(path, input);
      if (!started.ok) return { ...started, repetition: summary() };
      const completed = await waitForActivity(client, values, started);
      if (!completed.ok) return { ...completed, repetition: summary() };
      const activity = completed.data.activity;
      if (
        !activity ||
        (activity.kind !== 'gather' && activity.kind !== 'craft') ||
        activity.status !== 'ENDED'
      )
        throw new CliError('UPDATE_REQUIRED', {
          reason: 'unexpected_production_result',
        });
      if (activity.end_reason !== 'COMPLETED')
        return { ...completed, ok: false, repetition: summary() };
      confirmed += 1;
      produced[activity.output.item_id] =
        (produced[activity.output.item_id] ?? 0) + activity.produced_quantity;
      if (activity.kind === 'gather' && activity.ambush)
        return { ...completed, repetition: summary() };
      if (confirmed === count) return { ...completed, repetition: summary() };
    } catch (error) {
      if (error instanceof CliError)
        throw new CliError(error.code, {
          ...error.detail,
          repetition: summary(),
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
    throw new CliError('UPDATE_REQUIRED', { reason: 'missing_activity_id' });
  while (result.data.activity?.status === 'RUNNING') {
    const seconds = result.next_poll_after_seconds;
    if (!seconds)
      throw new CliError('UPDATE_REQUIRED', {
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
        });
      throw error;
    }
    if (!result.ok) return result;
    if (result.data.activity?.activity_id !== activityId)
      throw new CliError('UPDATE_REQUIRED', {
        reason: 'activity_id_mismatch',
        activity_id: activityId,
      });
  }
  return result;
}
