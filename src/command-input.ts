import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { CliError, invalidArguments } from './errors.js';
import type { CommandDefinition } from './command-definition.js';
import { locationIdSchema } from './protocol/movement.js';

export const optionsSchema = z.object({
  server: z.string(),
  allowInsecureHttp: z.boolean().optional(),
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
  bait: z.string().optional(),
  until: z.string().optional(),
  recipe: z.string().optional(),
  skill: z.string().optional(),
  count: z.string().optional(),
  quantity: z.string().optional(),
  maxFeePerLot: z.string().optional(),
  maxPayment: z.string().optional(),
  request: z.string().optional(),
  wait: z.boolean().optional(),
  instance: z.string().optional(),
  method: z.enum(['kit', 'npc']).optional(),
  enemy: z.string().optional(),
  preset: z.string().optional(),
  practice: z.boolean().optional(),
  job: z.string().optional(),
  drop: z.string().optional(),
  offer: z.string().optional(),
  fixedQuest: z.string().optional(),
  goal: z.string().optional(),
  quest: z.string().optional(),
  journal: z.string().optional(),
  article: z.string().optional(),
  // `guide --query` takes several words without quotes; the others take one value.
  query: z
    .union([
      z.string(),
      z.array(z.string()).transform((words) => words.join(' ')),
    ])
    .optional(),
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
  slot: z.string().optional(),
  room: z.string().optional(),
  record: z.string().optional(),
  clear: z.boolean().optional(),
  owner: z.string().optional(),
  renting: z.string().optional(),
  furnaceFee: z.string().optional(),
  forgeFee: z.string().optional(),
  workshopFee: z.string().optional(),
  alchemyFee: z.string().optional(),
  guestFee: z.string().optional(),
  text: z.string().optional(),
  items: z.string().optional(),
  gold: z.string().optional(),
  quality: z.string().optional(),
  allowQuality: z.string().optional(),
  useFine: z.boolean().optional(),
  levels: z.string().optional(),
  maxPrice: z.string().optional(),
  minDurability: z.string().optional(),
  unitPrice: z.string().optional(),
  source: z.string().optional(),
  price: z.string().optional(),
  order: z.string().optional(),
  listing: z.string().optional(),
  section: z.string().optional(),
  tier: z.string().optional(),
  number: z.string().optional(),
});

export type Values = z.infer<typeof optionsSchema>;

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// The server checks the body limit; this only bounds what the CLI buffers.
const maxStdinLength = 128 * 1024;

async function readStdin() {
  process.stdin.setEncoding('utf8');
  let text = '';
  for await (const chunk of process.stdin) {
    text += String(chunk);
    if (text.length > maxStdinLength) {
      throw new CliError('INVALID_INPUT_FILE', {
        message: 'Standard input is longer than 128 KiB.',
      });
    }
  }

  return text;
}

async function readInputText(file: string) {
  if (file === '-') return readStdin();

  try {
    return await readFile(file, 'utf8');
  } catch {
    throw new CliError('INVALID_INPUT_FILE', {
      message: `Could not read the input file ${file}.`,
    });
  }
}

async function readJsonFile(file: string): Promise<unknown> {
  const text = await readInputText(file);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new CliError('INVALID_INPUT_FILE', {
      message: `The input is not valid JSON: ${String(error)}. If a string contains a line break, write it as \\n.`,
    });
  }
}

/**
 * Converts a numeric flag after checking only its form: every numeric field the
 * CLI sends is a non-negative integer. The server checks the allowed range.
 */
export function integerFlag(option: string, value: string | boolean) {
  const number = Number(value);
  if (
    typeof value !== 'string' ||
    !/^\d+$/.test(value) ||
    !Number.isSafeInteger(number)
  ) {
    throw invalidArguments(
      [option],
      `--${option.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)} must be a non-negative integer.`,
    );
  }

  return number;
}

/** Builds the request body from `--input` or from the command's flags. */
export async function commandInput(
  definition: CommandDefinition,
  values: Values,
): Promise<Record<string, unknown>> {
  return values.input
    ? bodyFileInput(definition, values, values.input)
    : flagInput(definition, values);
}

async function bodyFileInput(
  definition: CommandDefinition,
  values: Values,
  file: string,
) {
  const fileBody = await readJsonFile(file);
  if (!isJsonObject(fileBody)) {
    throw new CliError('INVALID_INPUT_FILE', {
      message: 'The input must be a JSON object.',
    });
  }

  const body = definition.bodyInput?.(values, fileBody) ?? fileBody;

  return {
    ...(definition.autoRequestId ? { request_id: values.request } : {}),
    ...body,
    ...(values.character ? { character_id: values.character } : {}),
    ...(values.contentLanguage ? { locale: values.contentLanguage } : {}),
  };
}

function flagInput(definition: CommandDefinition, values: Values) {
  const input: Record<string, unknown> = {};
  const locale = values.contentLanguage ?? definition.defaultLocale;
  if (locale) input.locale = locale;
  if (values.character) input.character_id = values.character;

  const provided: Record<string, string | boolean | undefined> = values;
  for (const [option, field] of Object.entries(definition.input ?? {})) {
    const value = provided[option];
    if (value === undefined) continue;
    const [key, conversion] = typeof field === 'string' ? [field] : field;
    if (conversion === 'number') input[key] = integerFlag(option, value);
    else if (conversion === 'list') input[key] = String(value).split(',');
    else input[key] = value;
  }

  if (definition.autoRequestId) input.request_id = values.request;
  definition.buildInput?.(values, input);

  return input;
}

/**
 * The locations of a comma-separated `--to`, or undefined when `--to` is
 * absent or names one location. Throws when an entry is not a location ID or
 * with `--no-wait`. The server checks each step's destination.
 */
export function routeLocations(values: Values) {
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

export function repeatCount(
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
