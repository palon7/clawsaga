import { z } from 'zod';
import {
  itemIdSchema as itemId,
  localeSchema,
  characterIdSchema,
  skillIdSchema,
  equipmentSlotSchema,
  jobSchema,
} from './ids.js';
import {
  ambushReferenceSchema,
  locationIdSchema,
  locationViewSchema,
} from './movement.js';

const common = {
  character_id: characterIdSchema,
  locale: localeSchema.optional(),
};
export const gatherSchema = z.object({ ...common, item_id: itemId }).strict();
export const getRecipesSchema = z
  .object({ ...common, location_id: locationIdSchema.optional() })
  .strict();
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
  .object({ ...common, equipment_id: z.uuid() })
  .strict();
export const repairSchema = z
  .object({ ...common, equipment_id: z.uuid() })
  .strict();

const material = z.object({
  item_id: itemId,
  name: z.string(),
  quantity: z.number().int().positive(),
});
export const recipeViewSchema = z.object({
  recipe_id: z.string(),
  name: z.string(),
  inputs: z.array(
    material.extend({
      owned_quantity: z.number().int().nonnegative(),
      missing_quantity: z.number().int().nonnegative(),
    }),
  ),
  output: material,
  facility: z.enum(['alchemy', 'furnace', 'forge']).nullable(),
  unavailable_reasons: z.array(
    z.enum([
      'ACTIVITY_CONFLICT',
      'WRONG_LOCATION',
      'SKILL_REQUIRED',
      'MATERIALS_REQUIRED',
      'INSUFFICIENT_FUNDS',
      'CAPACITY_EXCEEDED',
    ]),
  ),
  skill_id: skillIdSchema,
  required_level: z.number().int().positive(),
  experience: z.number().int().positive(),
  fee_per_lot: z.number().int().nonnegative(),
  duration_seconds: z.number().int().positive(),
});
const productionFields = {
  activity_id: z.uuid(),
  location: locationViewSchema,
  started_at: z.iso.datetime(),
  completes_at: z.iso.datetime(),
  duration_seconds: z.number().int().positive(),
  output: material,
};
const gatheringFields = {
  ...productionFields,
  kind: z.literal('gather'),
  resource_id: z.string(),
};
const craftingFields = {
  ...productionFields,
  kind: z.literal('craft'),
  recipe_id: z.string(),
  escrow: z.array(material),
  fee_paid: z.number().int().nonnegative(),
  reserved_weight: z.number().int().nonnegative(),
};
const runningFields = {
  status: z.literal('RUNNING'),
  ended_at: z.null(),
  end_reason: z.null(),
  produced_quantity: z.literal(0),
};
const endedFields = {
  status: z.literal('ENDED'),
  ended_at: z.iso.datetime(),
  end_reason: z.enum([
    'COMPLETED',
    'STOPPED',
    'RESOURCE_DEPLETED',
    'CAPACITY_EXCEEDED',
  ]),
  produced_quantity: z.number().int().nonnegative(),
};
export const productionActivityViewSchema = z.union([
  z.object({ ...gatheringFields, ...runningFields }),
  z.object({
    ...gatheringFields,
    ...endedFields,
    ambush: ambushReferenceSchema.optional(),
  }),
  z.object({ ...craftingFields, ...runningFields }),
  z.object({ ...craftingFields, ...endedFields }),
]);
export const shopViewSchema = z.object({
  location: locationViewSchema,
  offers: z.array(
    z.object({
      item_id: itemId,
      name: z.string(),
      price: z.number().int().nonnegative(),
      quantity: z.number().int().nonnegative(),
      recovery_seconds: z.number().int().positive(),
      equipment: z.object({
        equip_slot: equipmentSlotSchema,
        required_job: jobSchema.nullable(),
        required_job_name: z.string().nullable(),
        power: z.number().int().nonnegative(),
        armor: z.number().int().nonnegative(),
      }),
    }),
  ),
});
