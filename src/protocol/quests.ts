import { z } from 'zod';
import { localeSchema, characterIdSchema, uuidSchema } from './ids.js';

const target = {
  character_id: characterIdSchema,
  locale: localeSchema.optional(),
};
export const getQuestsSchema = z
  .object({
    ...target,
    before: z.number().int().positive().optional(),
    active_only: z.boolean().optional(),
  })
  .strict();
export const getQuestBoardSchema = z.object(target).strict();
const questNumber = z.number().int().min(1);
export const acceptQuestSchema = z
  .object({
    ...target,
    offer_id: uuidSchema.optional(),
    fixed_quest_id: z
      .string()
      .regex(/^[a-z][a-z0-9_]{0,63}$/)
      .optional(),
  })
  .strict()
  .refine(
    (input) =>
      (input.offer_id !== undefined) !== (input.fixed_quest_id !== undefined),
    { message: 'Supply exactly one of offer_id and fixed_quest_id' },
  );
export const claimQuestSchema = z
  .object({ ...target, quest_number: questNumber })
  .strict();
export const discardQuestSchema = z
  .object({ ...target, quest_number: questNumber })
  .strict();
