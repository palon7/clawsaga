import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { CliError } from './errors.js';
import type { CommandDefinition } from './command-definition.js';

export const optionsSchema = z.object({
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
  inn: z.boolean().optional(),
  job: z.string().optional(),
  drop: z.string().optional(),
  offer: z.string().optional(),
  quest: z.string().optional(),
  journal: z.string().optional(),
  article: z.string().optional(),
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
  quality: z.string().optional(),
  levels: z.string().optional(),
  maxPrice: z.string().optional(),
  minDurability: z.string().optional(),
  unitPrice: z.string().optional(),
  source: z.string().optional(),
  price: z.string().optional(),
  order: z.string().optional(),
  listing: z.string().optional(),
  section: z.string().optional(),
});
export type Values = z.infer<typeof optionsSchema>;

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readStdin() {
  process.stdin.setEncoding('utf8');
  let text = '';
  for await (const chunk of process.stdin) {
    text += String(chunk);
    // 標準入力を無制限に読み込まない。本文の上限はサーバーが検査する。
    if (text.length > 128 * 1024) throw new CliError('INVALID_INPUT_FILE');
  }
  return text;
}

async function readJsonFile(file: string): Promise<unknown> {
  try {
    const text =
      file === '-' ? await readStdin() : await readFile(file, 'utf8');
    return JSON.parse(text);
  } catch {
    throw new CliError('INVALID_INPUT_FILE');
  }
}

/** The commander option key of a flag declaration: `--max-price <gold>` is `maxPrice`. */
export function optionKey(flags: string) {
  const long = flags
    .split(',')
    .map((part) => part.trim())
    .find((part) => part.startsWith('--'));
  const name = (long ?? flags).replace(/^--?/, '').split(' ')[0] ?? flags;
  return name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
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
  )
    throw new CliError('INVALID_ARGUMENTS', {
      fields: [option],
      message: `--${option.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)} must be a non-negative integer.`,
    });
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
  if (!isJsonObject(fileBody)) throw new CliError('INVALID_INPUT_FILE');
  const body = definition.bodyInput?.(values, fileBody) ?? fileBody;
  return {
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
  definition.buildInput?.(values, input);
  return input;
}
