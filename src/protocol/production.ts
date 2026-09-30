import { z } from 'zod';
import {
  itemIdSchema as itemId,
  localeSchema,
  characterIdSchema,
  skillIdSchema,
} from './ids.js';
import { locationIdSchema } from './movement.js';

const common = {
  character_id: characterIdSchema,
  locale: localeSchema.optional(),
};
export const gatherSchema = z.object({ ...common, item_id: itemId }).strict();
export const getRecipesSchema = z
  .object({
    ...common,
    location_id: locationIdSchema.optional(),
    skill_id: skillIdSchema.optional(),
    recipe_id: z.string().min(1).max(128).optional(),
  })
  .strict()
  .refine((input) => !(input.skill_id && input.recipe_id), {
    message: 'skill_id and recipe_id cannot be combined',
    path: ['skill_id'],
  });
export const getItemsSchema = z
  .object({
    ...common,
    query: z.string().trim().min(1).max(200).optional(),
    item_id: itemId.optional(),
  })
  .strict()
  .refine((input) => !(input.query && input.item_id), {
    message: 'query and item_id cannot be combined',
    path: ['query'],
  });
export const craftSchema = z
  .object({
    ...common,
    recipe_id: z.string().min(1).max(128),
    max_fee_per_lot: z.number().int().min(0).max(2_147_483_647).optional(),
    request_id: z.uuid(),
  })
  .strict();
export const stopActivitySchema = z
  .object({ ...common, activity_id: z.uuid() })
  .strict();
export const getShopSchema = z.object(common).strict();
export const buySchema = z
  .object({
    ...common,
    item_id: itemId,
    max_payment: z.number().int().min(0).max(2_147_483_647),
    request_id: z.uuid(),
  })
  .strict();
export const equipSchema = z
  .object({ ...common, instance_id: z.uuid() })
  .strict();
export const repairSchema = z
  .object({ ...common, instance_id: z.uuid() })
  .strict();
export const discardItemSchema = z
  .object({
    ...common,
    target: z.discriminatedUnion('kind', [
      z
        .object({
          kind: z.literal('stack'),
          item_id: itemId,
          quantity: z.number().int().positive().max(2_147_483_647),
        })
        .strict(),
      z
        .object({
          kind: z.literal('individual'),
          instance_id: z.uuid(),
        })
        .strict(),
    ]),
  })
  .strict();
