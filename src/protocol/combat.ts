import { z } from 'zod';
import {
  itemIdSchema,
  jobSchema,
  localeSchema,
  characterIdSchema,
  timestampSchema,
  uuidSchema,
} from './ids.js';
import { locationViewSchema } from './movement.js';

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

export const abilityEffectSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('damage'),
    damage_type: damageTypeSchema,
    power_percent: z.number().int().min(1).max(500),
    poison_ticks: z.number().int().min(0).max(6),
    interrupt: z.boolean(),
  }),
  z.object({
    kind: z.enum(['heal', 'restore_mp']),
    amount: z.number().int().positive().max(100),
  }),
  z.object({ kind: z.literal('cleanse') }),
  z.object({
    kind: z.literal('status'),
    status: z.enum(['guard', 'barrier', 'battle_song', 'soothing_song']),
    ticks: z.number().int().min(1).max(12),
  }),
]);
export const combatAbilitySchema = z.object({
  id: combatIdSchema,
  job_id: jobSchema,
  unlock_level: z.number().int().min(1).max(20),
  mp_cost: z.number().int().min(0).max(100),
  cooldown_ticks: z.number().int().min(1).max(12),
  effect: abilityEffectSchema,
});
export type CombatAbility = z.infer<typeof combatAbilitySchema>;
export const abilityViewSchema = combatAbilitySchema
  .extend({ name: z.string(), description: z.string() })
  .meta({ id: 'CombatAbility' });
export const tacticIssueSchema = z.object({
  rule_index: z.number().int().nonnegative(),
  code: z.literal('ABILITY_NOT_AVAILABLE'),
});
export type TacticIssue = z.infer<typeof tacticIssueSchema>;
export const tacticViewSchema = z.object({
  version: z.number().int().nonnegative(),
  tactic: tacticSchema,
  abilities: z.array(abilityViewSchema),
  presets: z.array(
    z.object({ id: presetIdSchema, name: z.string(), tactic: tacticSchema }),
  ),
});
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
    practice: z.boolean().optional(),
  })
  .strict();
export const restSchema = z.object(target).strict();
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

export const encounterViewSchema = z
  .object({
    enemy_id: combatIdSchema,
    name: z.string(),
    description: z.string(),
    level: z.number().int().positive(),
    max_hp: z.number().int().positive(),
    power: z.number().int().nonnegative(),
    armor: z.number().int().nonnegative(),
    heavy_power_percent: z.number().int().positive(),
    heavy_period_ticks: z.number().int().positive(),
    heavy_poison_ticks: z.number().int().nonnegative(),
    damage_type: damageTypeSchema,
    resistances: z.record(damageTypeSchema, z.number().int().min(-50).max(75)),
    practice: z.boolean(),
    aggressive: z.boolean(),
  })
  .meta({ id: 'Encounter' });
export const combatOutcomeSchema = z.enum(['VICTORY', 'DEFEATED', 'RETREATED']);
export type CombatOutcome = z.infer<typeof combatOutcomeSchema>;
export const combatFrameSchema = z.object({
  tick: z.number().int().positive(),
  action_id: z.string(),
  enemy_action: z.enum(['attack', 'heavy_attack', 'interrupted', 'none']),
  damage_dealt: z.number().int().nonnegative(),
  damage_taken: z.number().int().nonnegative(),
  healing: z.number().int().nonnegative(),
  hp: z.number().int().nonnegative(),
  mp: z.number().int().nonnegative(),
  enemy_hp: z.number().int().nonnegative(),
});
export type CombatFrame = z.infer<typeof combatFrameSchema>;
export const ambushTriggerSchema = z.object({
  activity_id: uuidSchema,
  kind: z.enum(['travel', 'gather']),
});
export const combatReportSchema = z
  .object({
    activity_id: uuidSchema,
    outcome: combatOutcomeSchema,
    practice: z.boolean(),
    elapsed_seconds: z.number().int().positive(),
    damage_dealt: z.number().int().nonnegative(),
    damage_taken: z.number().int().nonnegative(),
    healing: z.number().int().nonnegative(),
    items_used: z.array(
      z.object({
        item_id: itemIdSchema,
        quantity: z.number().int().positive(),
      }),
    ),
    experience_gained: z.number().int().nonnegative(),
    gold_gained: z.number().int().nonnegative(),
    loot: z.array(
      z.object({
        item_id: itemIdSchema,
        name: z.string(),
        quantity: z.number().int().positive(),
      }),
    ),
    unclaimed_loot: z.array(
      z.object({
        item_id: itemIdSchema,
        name: z.string(),
        quantity: z.number().int().positive(),
        reason: z.literal('BAG_FULL'),
      }),
    ),
    rules: z.array(
      z.object({
        rule_index: z.number().int().nonnegative(),
        executed: z.number().int().nonnegative(),
        skipped: z.object({
          condition: z.number().int().nonnegative(),
          mp: z.number().int().nonnegative(),
          cooldown: z.number().int().nonnegative(),
          unavailable: z.number().int().nonnegative(),
        }),
      }),
    ),
    frames: z.array(combatFrameSchema).max(48),
  })
  .meta({ id: 'CombatReport' });
export type CombatReport = z.infer<typeof combatReportSchema>;
export const combatSnapshotViewSchema = z
  .object({
    kind: z.literal('combat'),
    activity_id: uuidSchema,
    location: locationViewSchema,
    enemy_id: combatIdSchema,
    enemy_name: z.string(),
    practice: z.boolean(),
    trigger: ambushTriggerSchema.optional(),
    started_at: timestampSchema,
    time_limit_at: timestampSchema,
    next_update_at: timestampSchema.nullable(),
    next_action: tacticActionSchema.nullable(),
    duration_seconds: z.number().int().positive(),
    simulation_tick: z.number().int().nonnegative(),
    status: z.enum(['RUNNING', 'ENDED']),
    end_reason: combatOutcomeSchema.nullable(),
    ended_at: timestampSchema.nullable(),
    hp: z.number().int().nonnegative(),
    max_hp: z.number().int().positive(),
    mp: z.number().int().min(0).max(100),
    enemy_hp: z.number().int().nonnegative(),
    enemy_max_hp: z.number().int().positive(),
    enemy_windup_ticks: z.number().int().min(0).max(2),
    retreat_ticks: z.number().int().min(0).max(3),
    retreat_requested_tick: z.number().int().positive().nullable(),
    potions_remaining: z.number().int().nonnegative(),
    statuses: z.array(
      z.object({
        id: combatStatusSchema,
        remaining_ticks: z.number().int().positive(),
      }),
    ),
  })
  .meta({ id: 'CombatActivity' });
export const cancelledCombatViewSchema = z
  .object({
    kind: z.literal('combat'),
    activity_id: uuidSchema,
    status: z.literal('ENDED'),
    end_reason: z.literal('CANCELLED'),
    started_at: timestampSchema,
    duration_seconds: z.number().int().positive(),
    ended_at: timestampSchema,
  })
  .meta({ id: 'CancelledCombat' });
export const combatActivityViewSchema = z.union([
  combatSnapshotViewSchema,
  cancelledCombatViewSchema,
]);
export type CombatActivityView = z.infer<typeof combatActivityViewSchema>;
export const restActivityViewSchema = z
  .object({
    kind: z.literal('rest'),
    activity_id: uuidSchema,
    location: locationViewSchema,
    started_at: timestampSchema,
    completes_at: timestampSchema,
    duration_seconds: z.number().int().positive(),
    status: z.enum(['RUNNING', 'ENDED']),
    ended_at: timestampSchema.nullable(),
    end_reason: z.enum(['COMPLETED', 'STOPPED']).nullable(),
    hp: z.number().int().nonnegative(),
    max_hp: z.number().int().positive(),
    mp: z.number().int().min(0).max(100),
  })
  .meta({ id: 'RestActivity' });
export const lostItemsViewSchema = z.object({
  drop_id: uuidSchema,
  owner_character_id: characterIdSchema,
  location: locationViewSchema,
  protected_until: timestampSchema,
  expires_at: timestampSchema,
  items: z.array(
    z.object({
      item_id: itemIdSchema,
      name: z.string(),
      quantity: z.number().int().positive(),
    }),
  ),
});
