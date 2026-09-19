import { z } from 'zod';

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

export type CommandDefinition = {
  path: string;
  schema: z.ZodObject;
  flags: readonly CommandFlag[];
  requiresCharacter?: boolean;
  help: string;
  examples?: readonly string[];
  inputExample?: Record<string, unknown>;
};

export const globalOptions: readonly GlobalOption[] = [
  {
    flags: '-c, --character <id>',
    description: 'Public character ID',
    character: true,
  },
  {
    flags: '-l, --content-language <language>',
    description: 'Game content language for this call',
    choices: ['ja', 'en'],
  },
  {
    flags: '-s, --server <origin>',
    description: 'ClawSaga origin',
  },
];

export const jsonFlag = [
  '-i, --input <file>',
  'JSON body file, or - for stdin; the body fields are shown in input_example',
  true,
] as const;

export function bodySchema(definition: CommandDefinition) {
  const mask: Record<string, true> = { locale: true };
  if ('character_id' in definition.schema.shape) mask.character_id = true;
  return definition.schema.omit(mask);
}
