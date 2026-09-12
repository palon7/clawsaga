import { z } from 'zod';
import { travelActivityViewSchema } from './movement.js';
import { productionActivityViewSchema } from './production.js';
import { combatActivityViewSchema, restActivityViewSchema } from './combat.js';
export const activityViewSchema = z.union([
  travelActivityViewSchema,
  productionActivityViewSchema,
  combatActivityViewSchema,
  restActivityViewSchema,
]);
export type ActivityView = z.infer<typeof activityViewSchema>;
