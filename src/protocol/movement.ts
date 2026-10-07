import { z } from 'zod';
import { localeSchema, characterIdSchema } from './ids.js';

export const locationIdSchema = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/);

const common = {
  character_id: characterIdSchema.describe('The immutable Character ID.'),
  locale: localeSchema.optional(),
};
export const getMapSchema = z
  .object({ ...common, full: z.boolean().optional() })
  .strict();
export const lookSchema = z
  .object({
    ...common,
    people: z.boolean().optional(),
    cursor: characterIdSchema.optional(),
  })
  .strict();
export const getRouteSchema = z
  .object({ ...common, to: locationIdSchema })
  .strict();
export const travelSchema = z
  .object({ ...common, to: locationIdSchema })
  .strict();
export const rideCarriageSchema = travelSchema;
export const getActivitySchema = z
  .object({
    ...common,
    activity_id: z.uuid().optional(),
  })
  .strict();
