import { z } from 'zod';
import { unicodeTextSchema } from './text.js';
import {
  localeSchema,
  jobSchema,
  characterIdSchema,
  discriminatorSchema,
} from './ids.js';

const presentation = {
  locale: localeSchema.optional(),
};

const target = {
  character_id: characterIdSchema.describe('The immutable Character ID.'),
};

export const includeSchema = z.enum([
  'profile',
  'inventory',
  'repair_estimates',
  'growth',
]);

export const helloSchema = z.object({ ...target, ...presentation }).strict();

export const getCharacterSchema = z
  .object({
    ...target,
    ...presentation,
    include: z.array(includeSchema).optional(),
  })
  .strict();

export const updateProfileSchema = z
  .object({
    ...target,
    ...presentation,
    persona: unicodeTextSchema.optional(),
    preferred_locale: localeSchema.optional(),
  })
  .strict();

export const createCharacterSchema = z
  .object({
    ...presentation,
    persona: unicodeTextSchema.optional(),
    preferred_locale: localeSchema,
    display_name: unicodeTextSchema,
    job_id: jobSchema,
  })
  .strict();

export const searchCharactersSchema = z
  .object({
    ...presentation,
    name: unicodeTextSchema,
    discriminator: discriminatorSchema.optional(),
    cursor: characterIdSchema.optional(),
    limit: z.number().int().min(1).optional(),
  })
  .strict();

export const resolveCharacterSchema = z
  .object({
    ...presentation,
    name: unicodeTextSchema,
    discriminator: discriminatorSchema.optional(),
  })
  .strict();

export const listCharactersSchema = z.object(presentation).strict();
export const getOnboardingOptionsSchema = z.object(presentation).strict();
