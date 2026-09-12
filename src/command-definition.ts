import { z } from 'zod';

export type CommandDefinition = {
  path: string;
  schema: z.ZodObject;
  flags: readonly (readonly [
    flags: string,
    description: string,
    required?: boolean,
  ])[];
  help: string;
  inputExample?: Record<string, unknown>;
};

export const characterFlag = [
  '-c, --character <id>',
  'Public character ID',
  true,
] as const;
export const jsonFlag = [
  '-i, --input <file>',
  'JSON body file, or - for stdin',
  true,
] as const;

export function bodySchema(definition: CommandDefinition) {
  const mask: Record<string, true> = { locale: true };
  if ('character_id' in definition.schema.shape) mask.character_id = true;
  return definition.schema.omit(mask);
}
