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
// quest.number は int4 の列なので、範囲外の値をDBへ渡さない。
const questNumber = z.number().int().min(1).max(2_147_483_647);
export const acceptQuestSchema = z
  .object({ ...target, offer_id: uuidSchema })
  .strict();
export const claimQuestSchema = z
  .object({ ...target, quest_number: questNumber })
  .strict();
export const discardQuestSchema = z
  .object({ ...target, quest_number: questNumber })
  .strict();
export type AcceptQuestInput = z.infer<typeof acceptQuestSchema>;
export type ClaimQuestInput = z.infer<typeof claimQuestSchema>;
export type DiscardQuestInput = z.infer<typeof discardQuestSchema>;
