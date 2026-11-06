import { z } from 'zod';
import {
  itemIdSchema as itemId,
  characterTarget,
  skillIdSchema,
  activityIdSchema,
  instanceIdSchema,
  itemQualitySchema,
} from './ids.js';
import { locationIdSchema } from './movement.js';

export const gatherSchema = z
  .object({ ...characterTarget, item_id: itemId })
  .strict();

export const getRecipesSchema = z
  .object({
    ...characterTarget,
    location_id: locationIdSchema.optional(),
    skill_id: skillIdSchema.optional(),
    recipe_id: z.string().min(1).optional(),
  })
  .strict();

export const getItemsSchema = z
  .object({
    ...characterTarget,
    query: z.string().min(1).optional(),
    item_id: itemId.optional(),
  })
  .strict();

export const craftSchema = z
  .object({
    ...characterTarget,
    recipe_id: z.string().min(1),
    max_fee_per_lot: z.number().int().min(0).optional(),
    use_fine_materials: z.boolean().optional(),
    request_id: z.uuid(),
  })
  .strict();

export const stopActivitySchema = z
  .object({ ...characterTarget, activity_id: activityIdSchema })
  .strict();

export const getShopSchema = z.object(characterTarget).strict();

export const buySchema = z
  .object({
    ...characterTarget,
    item_id: itemId,
    quantity: z.number().int().positive().optional(),
    max_payment: z.number().int().min(0).optional(),
    request_id: z.uuid(),
  })
  .strict();

export const equipSchema = z
  .object({ ...characterTarget, instance_id: instanceIdSchema })
  .strict();

export const repairMethodSchema = z.enum(['kit', 'npc']);

export const repairSchema = z
  .object({
    ...characterTarget,
    instance_id: instanceIdSchema,
    method: repairMethodSchema,
  })
  .strict();

export const expandBagSchema = z
  .object({ ...characterTarget, tier: z.number().int().min(1) })
  .strict();

export const discardItemSchema = z
  .object({
    ...characterTarget,
    target: z.discriminatedUnion('kind', [
      z
        .object({
          kind: z.literal('stack'),
          item_id: itemId,
          quantity: z.number().int().positive(),
          quality: itemQualitySchema.optional(),
        })
        .strict(),
      z
        .object({
          kind: z.literal('individual'),
          instance_id: instanceIdSchema,
        })
        .strict(),
    ]),
  })
  .strict();
