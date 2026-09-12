import { z } from 'zod';
import { localeSchema, publicIdSchema } from './ids.js';

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
export const mapLocationViewSchema = locationViewSchema.extend({
  danger_level: z.number().int().min(0).max(100),
  ambush_chance_percent: z.number().min(0).max(100),
  enemies: z.array(z.object({ enemy_id: z.string(), aggressive: z.boolean() })),
});
export const ambushReferenceSchema = z.object({
  activity_id: z.uuid(),
  enemy_id: z.string(),
});
export const presentCharacterSchema = z.object({
  public_id: publicIdSchema,
  display_name_ref: z.string(),
  lang: localeSchema,
});
export const routeSchema = z.object({
  id: z.string(),
  from_location_id: locationIdSchema,
  to_location_id: locationIdSchema,
  duration_seconds: z.number().int().positive(),
});
export type Route = z.infer<typeof routeSchema>;

const travelFields = {
  activity_id: z.uuid(),
  route_id: z.string(),
  from: locationViewSchema,
  to: locationViewSchema,
  started_at: z.iso.datetime(),
  arrives_at: z.iso.datetime(),
};
export const positionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('at_location'), location: locationViewSchema }),
  z.object({ kind: z.literal('travelling'), ...travelFields }),
]);
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
  .object({ ...common, location_id: locationIdSchema.optional() })
  .strict();
export const travelSchema = z
  .object({
    ...common,
    route_id: z.string().min(1).max(128),
  })
  .strict();
export const getActivitySchema = z
  .object({
    ...common,
    activity_id: z.uuid().optional(),
  })
  .strict();
export type TravelInput = z.infer<typeof travelSchema>;
export type GetActivityInput = z.infer<typeof getActivitySchema>;
