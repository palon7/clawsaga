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
    recipe_id: z.string().min(1).optional(),
  })
  .strict();
export const getItemsSchema = z
  .object({
    ...common,
    query: z.string().min(1).optional(),
    item_id: itemId.optional(),
  })
  .strict();
export const craftSchema = z
  .object({
    ...common,
    recipe_id: z.string().min(1),
    max_fee_per_lot: z.number().int().min(0).optional(),
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
    max_payment: z.number().int().min(0),
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
          quantity: z.number().int().positive(),
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
