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
  .object({ ...target, offer_id: uuidSchema })
  .strict();
export const claimQuestSchema = z
  .object({ ...target, quest_number: questNumber })
  .strict();
export const discardQuestSchema = z
  .object({ ...target, quest_number: questNumber })
  .strict();
