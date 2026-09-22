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

const material = z.object({
  item_id: itemId,
  name: z.string(),
  quantity: z.number().int().positive(),
});
export const equipmentStatsSchema = z.object({
  equip_slot: equipmentSlotSchema,
  required_job: jobSchema.nullable(),
  required_job_name: z.string().nullable(),
  power: z.number().int().nonnegative(),
  armor: z.number().int().nonnegative(),
});
const useEffectSchema = z.object({
  hp_recovery: z.number().int().nonnegative(),
  mp_recovery: z.number().int().nonnegative(),
});

export const itemCatalogEntrySchema = z.object({
  item_id: itemId,
  name: z.string(),
  summary: z.string(),
});

// The parts of an item every context shares. Inventory, shop and recipe rows
// build on this and add only the quantity, price or instance state they need.
export const itemSummarySchema = z.object({
  item_id: itemId,
  name: z.string(),
  unit_weight: z.number().int().positive(),
  tradeable: z.boolean(),
  equipment: equipmentStatsSchema.optional(),
  use_effect: useEffectSchema.optional(),
});

export const itemDetailSchema = itemSummarySchema.extend({
  description: z.string(),
  use_conditions: z.array(z.enum(['idle', 'standard_quality'])),
});

export const itemCatalogSchema = z.object({
  entries: z.array(itemCatalogEntrySchema),
  detail: itemDetailSchema.nullable(),
});

export const recipeSummarySchema = z.object({
  recipe_id: z.string(),
  name: z.string(),
  output_item_id: itemId,
  skill_id: skillIdSchema,
  required_level: z.number().int().positive(),
});

export const recipeViewSchema = z.object({
  recipe_id: z.string(),
  name: z.string(),
  inputs: z.array(
    itemSummarySchema.extend({
      quantity: z.number().int().positive(),
      owned_quantity: z.number().int().nonnegative(),
      missing_quantity: z.number().int().nonnegative(),
      source_recipe: z
        .object({ recipe_id: z.string(), name: z.string() })
        .optional(),
    }),
  ),
  output: itemSummarySchema.extend({
    quantity: z.number().int().positive(),
  }),
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
export const recipeCatalogSchema = z.object({
  entries: z.array(recipeSummarySchema),
  detail: recipeViewSchema.nullable(),
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
export const productionExperienceSchema = z.object({
  skill_id: skillIdSchema,
  awarded: z.number().int().nonnegative(),
});

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
  experience: productionExperienceSchema.optional(),
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
    itemSummarySchema.extend({
      price: z.number().int().nonnegative(),
      quantity: z.number().int().nonnegative(),
      recovery_seconds: z.number().int().positive(),
    }),
  ),
});
