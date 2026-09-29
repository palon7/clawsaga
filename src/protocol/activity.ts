import { z } from 'zod';
import { itemIdSchema, jobSchema } from './ids.js';
import {
  ambushReferenceSchema,
  locationViewSchema,
  travelActivityViewSchema,
} from './movement.js';
import {
  productionActivityViewSchema,
  productionExperienceSchema,
} from './production.js';
import { combatActivityViewSchema, restActivityViewSchema } from './combat.js';

// 期限の確定がサーバー側の失敗で続けられず終了した活動。成果を持たず、資産・位置・
// HP・MPは開始時点のまま変えない。
export const failedActivityViewSchema = z.object({
  kind: z.enum(['travel', 'gather', 'craft', 'combat', 'rest']),
  activity_id: z.uuid(),
  status: z.literal('ENDED'),
  end_reason: z.literal('FAILED'),
  started_at: z.iso.datetime(),
  duration_seconds: z.number().int().positive(),
  ended_at: z.iso.datetime(),
});
export const activityViewSchema = z.union([
  travelActivityViewSchema,
  productionActivityViewSchema,
  combatActivityViewSchema,
  restActivityViewSchema,
  failedActivityViewSchema,
]);
export type ActivityView = z.infer<typeof activityViewSchema>;

export const agentMaterialSchema = z.object({
  item_id: itemIdSchema,
  name: z.string(),
  quantity: z.number().int().nonnegative(),
});

const productionRunning = {
  activity_id: z.uuid(),
  status: z.literal('RUNNING'),
  started_at: z.iso.datetime(),
  completes_at: z.iso.datetime(),
  duration_seconds: z.number().int().positive(),
  output: agentMaterialSchema,
};

export const agentRunningTravelSchema = z.object({
  kind: z.literal('travel'),
  activity_id: z.uuid(),
  from: locationViewSchema,
  to: locationViewSchema,
  started_at: z.iso.datetime(),
  arrives_at: z.iso.datetime(),
  duration_seconds: z.number().int().positive(),
  status: z.literal('RUNNING'),
});
export const agentRunningGatherSchema = z.object({
  ...productionRunning,
  kind: z.literal('gather'),
});
export const agentRunningCraftSchema = z.object({
  ...productionRunning,
  kind: z.literal('craft'),
  recipe_id: z.string(),
});
export const agentRunningCombatSchema = z.object({
  kind: z.literal('combat'),
  activity_id: z.uuid(),
  enemy_id: z.string(),
  enemy_name: z.string(),
  practice: z.boolean(),
  started_at: z.iso.datetime(),
  time_limit_at: z.iso.datetime(),
  next_update_at: z.iso.datetime().nullable(),
  duration_seconds: z.number().int().positive(),
  status: z.literal('RUNNING'),
  hp: z.number().int().nonnegative(),
  max_hp: z.number().int().positive(),
  mp: z.number().int().min(0).max(100),
  enemy_hp: z.number().int().nonnegative(),
  enemy_max_hp: z.number().int().positive(),
  retreat_ticks: z.number().int().min(0).max(3),
  retreat_requested_tick: z.number().int().positive().nullable(),
});
export const agentRunningRestSchema = z.object({
  kind: z.literal('rest'),
  activity_id: z.uuid(),
  started_at: z.iso.datetime(),
  completes_at: z.iso.datetime(),
  duration_seconds: z.number().int().positive(),
  status: z.literal('RUNNING'),
  hp: z.number().int().nonnegative(),
  max_hp: z.number().int().positive(),
  mp: z.number().int().min(0).max(100),
  inn: z.boolean(),
});
export const agentRunningActivitySchema = z.union([
  agentRunningTravelSchema,
  agentRunningGatherSchema,
  agentRunningCraftSchema,
  agentRunningCombatSchema,
  agentRunningRestSchema,
]);
export type AgentRunningActivity = z.infer<typeof agentRunningActivitySchema>;

const ended = {
  activity_id: z.uuid(),
  status: z.literal('ENDED'),
  ended_at: z.iso.datetime(),
};

export const agentTravelResultSchema = z.object({
  ...ended,
  kind: z.literal('travel'),
  end_reason: z.enum(['COMPLETED', 'CANCELLED']),
  to: locationViewSchema,
  characters_count: z.number().int().nonnegative().optional(),
  ambush: ambushReferenceSchema.optional(),
});
export const agentGatherResultSchema = z.object({
  ...ended,
  kind: z.literal('gather'),
  end_reason: z.enum([
    'COMPLETED',
    'STOPPED',
    'RESOURCE_DEPLETED',
    'CAPACITY_EXCEEDED',
  ]),
  output: agentMaterialSchema,
  experience: productionExperienceSchema.optional(),
  ambush: ambushReferenceSchema.optional(),
});
export const agentCraftResultSchema = z.object({
  ...ended,
  kind: z.literal('craft'),
  end_reason: z.enum(['COMPLETED', 'STOPPED']),
  recipe_id: z.string(),
  output: agentMaterialSchema,
  experience: productionExperienceSchema.optional(),
  fee_paid: z.number().int().nonnegative(),
});

export const agentCombatSummarySchema = z.object({
  experience: z.object({
    job_id: jobSchema,
    awarded: z.number().int().nonnegative(),
  }),
  gold_gained: z.number().int().nonnegative(),
  loot: z.array(agentMaterialSchema),
  unclaimed_loot: z.array(agentMaterialSchema),
  items_used: z.array(
    z.object({
      item_id: itemIdSchema,
      quantity: z.number().int().positive(),
    }),
  ),
});
export type AgentCombatSummary = z.infer<typeof agentCombatSummarySchema>;

export const agentRestSummarySchema = z.object({
  hp: z.number().int().nonnegative(),
  mp: z.number().int().min(0).max(100),
  weakened_until: z.iso.datetime().nullable(),
});
export type AgentRestSummary = z.infer<typeof agentRestSummarySchema>;

const agentSettledCombatResultSchema = z.object({
  ...ended,
  kind: z.literal('combat'),
  end_reason: z.enum(['VICTORY', 'DEFEATED', 'RETREATED']),
  enemy_id: z.string(),
  enemy_name: z.string(),
  practice: z.boolean(),
  summary: agentCombatSummarySchema,
});
const agentCancelledCombatResultSchema = z.object({
  ...ended,
  kind: z.literal('combat'),
  end_reason: z.literal('CANCELLED'),
  summary: z.null(),
});
export const agentCombatResultSchema = z.discriminatedUnion('end_reason', [
  agentSettledCombatResultSchema,
  agentCancelledCombatResultSchema,
]);
export const agentRestResultSchema = z.object({
  ...ended,
  kind: z.literal('rest'),
  end_reason: z.enum(['COMPLETED', 'STOPPED']),
  summary: agentRestSummarySchema,
});
export const agentFailedResultSchema = z.object({
  ...ended,
  kind: z.enum(['travel', 'gather', 'craft', 'combat', 'rest']),
  end_reason: z.literal('FAILED'),
});
export const agentLastResultSchema = z.union([
  z.discriminatedUnion('kind', [
    agentTravelResultSchema,
    agentGatherResultSchema,
    agentCraftResultSchema,
    agentCombatResultSchema,
    agentRestResultSchema,
  ]),
  agentFailedResultSchema,
]);
export type AgentLastResult = z.infer<typeof agentLastResultSchema>;
