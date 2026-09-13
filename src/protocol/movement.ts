import { z } from 'zod';
import { itemIdSchema, localeSchema, publicIdSchema } from './ids.js';

export const locationIdSchema = z.enum([
  'selene',
  'dolgan',
  'corvent',
  'mossway',
  'silverthread_lake',
  'openpit',
  'south_road',
  'crossroads',
]);
export type LocationId = z.infer<typeof locationIdSchema>;

export const locationViewSchema = z.object({
  id: locationIdSchema,
  name: z.string(),
  kind: z.enum(['town', 'field', 'camp']),
});
const mapConnectionSchema = z.object({
  to: locationIdSchema,
  duration_seconds: z.number().int().positive(),
});
export const mapViewSchema = z.object({
  locations: z.array(
    locationViewSchema.extend({
      connections: z.array(mapConnectionSchema),
    }),
  ),
});
export const facilitySchema = z.enum(['shop', 'alchemy', 'furnace', 'forge']);
export const lookResourceSchema = z.object({
  item_id: itemIdSchema,
  name: z.string(),
  quantity: z.number().int().nonnegative(),
  capacity: z.number().int().positive(),
  recovery_quantity: z.number().int().positive(),
  recovery_seconds: z.number().int().positive(),
  next_recovery_at: z.iso.datetime().nullable(),
  base_duration_seconds: z.number().int().positive(),
  required_tool: itemIdSchema.nullable(),
});
export const lookEnemySchema = z.object({
  enemy_id: z.string(),
  name: z.string(),
  aggressive: z.boolean(),
});
export const lookViewSchema = z.object({
  location: locationViewSchema,
  resources: z.array(lookResourceSchema),
  enemies: z.array(lookEnemySchema),
  facilities: z.array(facilitySchema),
  people: z
    .array(
      z.object({
        public_id: publicIdSchema,
        lang: localeSchema,
        user_content: z.object({ display_name: z.string() }),
      }),
    )
    .optional(),
});
export const routeStepSchema = z.object({
  to: locationIdSchema,
  duration_seconds: z.number().int().positive(),
});
export const routeViewSchema = z.object({
  from: locationViewSchema,
  to: locationViewSchema,
  duration_seconds: z.number().int().nonnegative(),
  steps: z.array(routeStepSchema),
});
export const ambushReferenceSchema = z.object({
  activity_id: z.uuid(),
  enemy_id: z.string(),
});
export const presentCharacterSchema = z.object({
  public_id: publicIdSchema,
  lang: localeSchema,
  user_content: z.object({ display_name: z.string() }),
});

const travelFields = {
  activity_id: z.uuid(),
  from: locationViewSchema,
  to: locationViewSchema,
  started_at: z.iso.datetime(),
  arrives_at: z.iso.datetime(),
};
export const positionSchema = locationViewSchema.nullable();
export const travelActivityViewSchema = z
  .object({
    kind: z.literal('travel'),
    ...travelFields,
    duration_seconds: z.number().int().positive(),
  })
  .and(
    z.discriminatedUnion('status', [
      z.object({
        status: z.literal('RUNNING'),
        ended_at: z.null(),
        end_reason: z.null(),
      }),
      z.object({
        status: z.literal('ENDED'),
        ended_at: z.iso.datetime(),
        end_reason: z.literal('COMPLETED'),
        characters: z.array(presentCharacterSchema),
        ambush: ambushReferenceSchema.optional(),
      }),
    ]),
  );
export type Position = z.infer<typeof positionSchema>;

const common = {
  character_id: publicIdSchema.describe('The public character ID.'),
  locale: localeSchema.optional(),
};
export const getMapSchema = z
  .object({ ...common, full: z.boolean().optional() })
  .strict();
export const lookSchema = z
  .object({ ...common, people: z.boolean().optional() })
  .strict();
export const getRouteSchema = z
  .object({ ...common, to: locationIdSchema })
  .strict();
export const travelSchema = z
  .object({ ...common, to: locationIdSchema })
  .strict();
export const getActivitySchema = z
  .object({
    ...common,
    activity_id: z.uuid().optional(),
  })
  .strict();
export type TravelInput = z.infer<typeof travelSchema>;
export type GetActivityInput = z.infer<typeof getActivitySchema>;
