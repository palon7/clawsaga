import { z } from 'zod';
import type { Values } from './command-input.js';

export type CommandFlag = readonly [
  flags: string,
  description: string,
  required?: boolean,
  choices?: readonly string[],
];

export type GlobalOption = {
  flags: string;
  description: string;
  character?: boolean;
  choices?: readonly string[];
};

/**
 * Where a flag's value goes in the request body: a key that receives the value
 * as given (strings as strings, boolean flags as true), or a key with a
 * conversion.
 */
export type InputField =
  string | readonly [key: string, conversion: 'number' | 'list'];

export type CommandDefinition = {
  path: string;
  schema: z.ZodObject;
  flags: readonly CommandFlag[];
  /** Request body fields by commander option key (`--max-price` is `maxPrice`). */
  input?: Readonly<Record<string, InputField>>;
  /** Adds the body fields that `input` cannot express. */
  buildInput?: (values: Values, input: Record<string, unknown>) => void;
  /** With `--input`, applies flags to the parsed body file or rejects conflicting ones. */
  bodyInput?: (
    values: Values,
    body: Record<string, unknown>,
  ) => Record<string, unknown>;
  /** Content language sent when neither -l nor the environment sets one. */
  defaultLocale?: 'en';
  requiresCharacter?: boolean;
  /** Generates request_id unless --request supplies one. */
  autoRequestId?: boolean;
  /** Starts a main activity: accepts --no-wait, otherwise waits for its result. */
  startsActivity?: boolean;
  /**
   * Accepts --count and repeats the activity one attempt at a time. Craft
   * sends a new request ID per lot.
   */
  repeat?: { requestIdPerLot: boolean };
  /** A lost response may still have changed items, so the outcome is unknown. */
  changesItems?: boolean;
  /** Fields added to the detail of a CliError raised by the game request. */
  errorContext?: (values: Values) => Record<string, unknown>;
  help: string;
  examples?: readonly string[];
  inputExample?: Record<string, unknown>;
};

export const globalOptions: readonly GlobalOption[] = [
  {
    flags: '-c, --character <id>',
    description: 'Character ID; required by character commands',
    character: true,
  },
  {
    flags: '-l, --content-language <language>',
    description: 'Game content language for this call',
    choices: ['ja', 'en'],
  },
  {
    flags: '-s, --server <origin>',
    description:
      'Game server URL without a path; defaults to CLAWSAGA_SERVER or https://clawsaga.net',
  },
];

export const jsonFlag = [
  '-i, --input <file>',
  'JSON body file, or - for stdin; the body fields are shown in input_example',
  true,
] as const;

export const limitFlag = [
  '--limit <number>',
  'Entries per page; limits and defaults are set by the server',
] as const;

// A local option only. It changes how long the CLI waits, never the game
// request body, so it stays out of every input schema.
export const noWaitFlag = [
  '--no-wait',
  'Return after acceptance without waiting for completion; --count must be 1 or omitted',
] as const;

export function bodySchema(definition: CommandDefinition) {
  const mask: Record<string, true> = { locale: true };
  if ('character_id' in definition.schema.shape) mask.character_id = true;
  return z.strictObject(definition.schema.shape).omit(mask);
}
