import { z } from 'zod';
import {
  itemIdSchema,
  jobSchema,
  localeSchema,
  characterIdSchema,
  uuidSchema,
} from './ids.js';

const target = {
  character_id: characterIdSchema,
  locale: localeSchema.optional(),
};
export const combatIdSchema = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/);
export const damageTypeSchema = z.enum([
  'physical',
  'fire',
  'ice',
  'lightning',
  'holy',
]);
export type DamageType = z.infer<typeof damageTypeSchema>;
export const combatStatusSchema = z.enum([
  'poison',
  'guard',
  'barrier',
  'battle_song',
  'soothing_song',
]);
export type CombatStatus = z.infer<typeof combatStatusSchema>;

export const tacticConditionSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.enum(['hp_below', 'mp_below', 'enemy_hp_below']),
      percent: z.number().int().min(1).max(100),
    })
    .strict()
    .describe(
      'Matches when the named current percentage is strictly below percent. HP percentages use current / maximum HP; MP uses its 0–100 value.',
    ),
  z
    .object({ kind: z.literal('enemy_winding_up') })
    .strict()
    .describe(
      'Matches when the enemy heavy attack is at most two ticks away, including the tick it occurs.',
    ),
  z
    .object({ kind: z.literal('enemy_attacking_heavy') })
    .strict()
    .describe('Matches on the tick when the enemy heavy attack occurs.'),
  z
    .object({ kind: z.literal('enemy_recovering') })
    .strict()
    .describe('Matches on the recovery tick after a heavy attack.'),
  z
    .object({ kind: z.literal('enemy_heavy_interruptible') })
    .strict()
    .describe(
      'Matches when the scheduled enemy heavy attack can be interrupted.',
    ),
  z
    .object({
      kind: z.literal('potions_below'),
      count: z.number().int().min(1).max(21),
    })
    .strict()
    .describe(
      'Matches when usable healing potions remaining in this battle are strictly below count.',
    ),
  z
    .object({ kind: z.literal('enemy_weak_to'), damage_type: damageTypeSchema })
    .strict()
    .describe('Matches when the enemy resistance for damage_type is negative.'),
  z
    .object({
      kind: z.enum(['self_has_status', 'self_missing_status']),
      status: combatStatusSchema,
    })
    .strict()
    .describe(
      'Matches when the named self status has remaining ticks, or has none, respectively.',
    ),
  z
    .object({
      kind: z.literal('enemy_missing_status'),
      status: z.literal('poison'),
    })
    .strict()
    .describe('Matches when the enemy has no remaining poison ticks.'),
]);
export const tacticActionSchema = z.discriminatedUnion('kind', [
  z
    .object({ kind: z.enum(['attack', 'defend', 'potion', 'retreat']) })
    .strict()
    .describe(
      'A potion action is usable only with a remaining potion and missing HP.',
    ),
  z
    .object({ kind: z.literal('ability'), ability_id: combatIdSchema })
    .strict()
    .describe(
      'Uses the ability when it is unlocked, off cooldown, affordable in MP and its effect is currently applicable.',
    ),
]);
export const tacticSchema = z
  .object({
    rules: z
      .array(
        z
          .object({
            conditions: z
              .array(tacticConditionSchema)
              .max(3)
              .describe(
                'All conditions must match (AND); an empty list always matches.',
              ),
            action: tacticActionSchema,
          })
          .strict(),
      )
      .max(8)
      .describe(
        'Evaluated from top to bottom each tick. The first matching, usable action runs; otherwise use a basic attack.',
      ),
    potion_limit: z
      .number()
      .int()
      .min(0)
      .max(20)
      .describe(
        'Maximum healing potions the tactic may use in one battle, limited by the bag quantity at start. Each potion is consumed when used; zero disables potion use.',
      ),
  })
  .strict()
  .meta({ id: 'Tactic' });
export type Tactic = z.infer<typeof tacticSchema>;
export type TacticAction = z.infer<typeof tacticActionSchema>;
export const presetIdSchema = z.enum(['safe', 'aggressive']);
export type PresetId = z.infer<typeof presetIdSchema>;
export const getTacticsSchema = z.object(target).strict();
export const setTacticsSchema = z
  .object({ ...target, tactic: tacticSchema })
  .strict();
export const validateTacticsSchema = setTacticsSchema;
export const startCombatSchema = z
  .object({
    ...target,
    enemy_id: combatIdSchema,
    preset: presetIdSchema.optional(),
    tactic: tacticSchema.optional(),
    practice: z.boolean().optional(),
  })
  .strict()
  .refine((input) => !(input.preset && input.tactic), {
    path: ['tactic'],
    message: 'Choose either tactic or preset, not both.',
  });
export const restSchema = z
  .object({
    ...target,
    inn: z.boolean().optional().meta({
      description:
        'true pays the inn fee from rest_estimate.inn for faster recovery. Omit for free rest.',
    }),
  })
  .strict();
export const useItemSchema = z
  .object({
    ...target,
    item_id: itemIdSchema,
  })
  .strict();
export const changeJobSchema = z
  .object({ ...target, job_id: jobSchema })
  .strict();
export const getCombatReportSchema = z
  .object({ ...target, activity_id: uuidSchema })
  .strict();
export const getEncountersSchema = z.object(target).strict();
export const getLostItemsSchema = z.object(target).strict();
export const recoverLostItemsSchema = z
  .object({ ...target, drop_id: uuidSchema })
  .strict();
export type StartCombatInput = z.infer<typeof startCombatSchema>;
export type SetTacticsInput = z.infer<typeof setTacticsSchema>;
export type UseItemInput = z.infer<typeof useItemSchema>;
export type ChangeJobInput = z.infer<typeof changeJobSchema>;
