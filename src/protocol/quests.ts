import { z } from 'zod';
import {
  itemIdSchema,
  jobSchema,
  localeSchema,
  characterIdSchema,
  timestampSchema,
  uuidSchema,
} from './ids.js';
import { combatIdSchema } from './combat.js';
import { locationIdSchema } from './movement.js';

export const questObjectiveSchema = z
  .discriminatedUnion('kind', [
    z.object({
      kind: z.literal('gather'),
      item_id: itemIdSchema,
      quantity: z.number().int().min(1).max(1000),
    }),
    z.object({
      kind: z.literal('hunt'),
      enemy_id: combatIdSchema,
      location_id: locationIdSchema.nullable(),
      quantity: z.number().int().min(1).max(1000),
    }),
  ])
  .meta({ id: 'QuestObjective' });
export type QuestObjective = z.infer<typeof questObjectiveSchema>;
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
export const acceptQuestSchema = z
  .object({ ...target, offer_id: uuidSchema })
  .strict();
export const claimQuestSchema = z
  .object({ ...target, quest_id: uuidSchema })
  .strict();
export const discardQuestSchema = z
  .object({ ...target, quest_id: uuidSchema })
  .strict();
export type AcceptQuestInput = z.infer<typeof acceptQuestSchema>;
export type ClaimQuestInput = z.infer<typeof claimQuestSchema>;
export type DiscardQuestInput = z.infer<typeof discardQuestSchema>;
export const questBudgetStageSchema = z.enum(['ample', 'low', 'halted']);
export type QuestBudgetStage = z.infer<typeof questBudgetStageSchema>;
export const questOfferSchema = z
  .object({
    offer_id: uuidSchema,
    family_id: combatIdSchema,
    name: z.string(),
    description: z.string(),
    town_id: locationIdSchema,
    objective: questObjectiveSchema,
    target_name: z.string(),
    reward_gold: z.number().int().nonnegative(),
    reward_experience: z.number().int().nonnegative(),
    duration_after_accept: z
      .number()
      .int()
      .positive()
      .describe('Hours to claim the quest, counted from acceptance.'),
    posted_at: timestampSchema,
    expires_at: timestampSchema.describe(
      'When this offer leaves the board if nobody accepts it.',
    ),
  })
  .meta({ id: 'QuestOffer' });
export const questViewSchema = z
  .object({
    quest_id: uuidSchema,
    number: z.number().int().positive(),
    family_id: combatIdSchema,
    name: z.string(),
    town_id: locationIdSchema,
    objective: questObjectiveSchema,
    target_name: z.string(),
    progress: z.number().int().nonnegative(),
    status: z.enum(['ACCEPTED', 'COMPLETED', 'EXPIRED', 'DISCARDED']),
    reward_gold: z.number().int().nonnegative(),
    reward_experience: z.number().int().nonnegative(),
    job_id: jobSchema,
    accepted_at: timestampSchema,
    expires_at: timestampSchema.describe(
      'Claim deadline for this accepted quest, counted from accepted_at.',
    ),
    completed_at: timestampSchema.nullable(),
  })
  .meta({ id: 'Quest' });
export type QuestView = z.infer<typeof questViewSchema>;
