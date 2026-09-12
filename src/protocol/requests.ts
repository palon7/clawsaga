import { z } from 'zod';
import { unicodeTextSchema } from './text.js';
import { localeSchema, jobSchema, publicIdSchema } from './ids.js';

export const displayNameSchema = unicodeTextSchema
  .transform((s) => s.trim().normalize('NFC'))
  .refine(
    (s) =>
      [...s].length >= 3 &&
      [...s].length <= 32 &&
      !/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(s),
    'Use 3–32 characters without line breaks or control characters.',
  );

const personaSchema = unicodeTextSchema.refine((s) => [...s].length <= 4000);

const presentation = {
  locale: localeSchema.optional(),
};

const target = {
  character_id: publicIdSchema.describe('The public character ID.'),
};

export const includeSchema = z.enum(['profile', 'inventory']);

export const helloSchema = z.object({ ...target, ...presentation }).strict();
export type HelloInput = z.infer<typeof helloSchema>;

export const getCharacterSchema = z
  .object({
    ...target,
    ...presentation,
    include: z.array(includeSchema).max(2).optional(),
  })
  .strict();

export const updateProfileSchema = z
  .object({
    ...target,
    ...presentation,
    persona: personaSchema.optional(),
    preferred_locale: localeSchema.optional(),
  })
  .strict();

export const createCharacterSchema = z
  .object({
    ...presentation,
    persona: personaSchema.optional(),
    preferred_locale: localeSchema.optional(),
    display_name: displayNameSchema,
    public_id: publicIdSchema,
    job_id: jobSchema,
  })
  .strict();

export const listCharactersSchema = z.object(presentation).strict();
export const getOnboardingOptionsSchema = z.object(presentation).strict();

export type GetCharacterInput = z.infer<typeof getCharacterSchema>;

export type CreateCharacterInput = z.infer<typeof createCharacterSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
