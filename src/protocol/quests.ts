import { z } from 'zod';
import { combatIdSchema } from './combat.js';
import { characterTarget, itemIdSchema, uuidSchema } from './ids.js';

export const getQuestsSchema = z
  .object({
    ...characterTarget,
    before: z.number().int().positive().optional(),
    active_only: z.boolean().optional(),
  })
  .strict();

export const getQuestBoardSchema = z.object(characterTarget).strict();
const questNumber = z.number().int().min(1);

export const acceptQuestSchema = z
  .object({
    ...characterTarget,
    offer_id: uuidSchema.optional(),
    fixed_quest_id: combatIdSchema.optional(),
    goal_id: questNumber.optional(),
  })
  .strict()
  .refine(
    (input) =>
      [input.offer_id, input.fixed_quest_id, input.goal_id].filter(
        (source) => source !== undefined,
      ).length === 1,
    { message: 'Supply exactly one of offer_id, fixed_quest_id and goal_id' },
  );

export const deliverGoalSchema = z
  .object({
    ...characterTarget,
    goal_id: questNumber,
    item_id: itemIdSchema,
    quantity: questNumber,
  })
  .strict();

export const claimQuestSchema = z
  .object({
    ...characterTarget,
    quest_number: questNumber.optional(),
    goal_id: questNumber.optional(),
  })
  .strict()
  .refine(
    (input) =>
      (input.quest_number !== undefined) !== (input.goal_id !== undefined),
    { message: 'Supply exactly one of quest_number and goal_id' },
  );

export const discardQuestSchema = z
  .object({ ...characterTarget, quest_number: questNumber })
  .strict();
