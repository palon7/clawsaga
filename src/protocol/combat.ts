import { z } from 'zod';
import {
  itemIdSchema,
  jobSchema,
  characterTarget,
  activityIdSchema,
  dropIdSchema,
} from './ids.js';

export const combatIdSchema = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/);

export const damageTypeSchema = z.enum([
  'physical',
  'fire',
  'ice',
  'lightning',
  'holy',
]);

export const combatStatusSchema = z.enum([
  'poison',
  'guard',
  'barrier',
  'battle_song',
  'soothing_song',
]);

export const tacticConditionSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.enum(['hp_below', 'mp_below', 'enemy_hp_below']),
      percent: z.number().int().min(1),
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
      count: z.number().int().min(1),
    })
    .strict()
    .describe(
      'Matches when usable potions remaining in this battle are strictly below count.',
    ),
  z
    .object({ kind: z.literal('enemy_weak_to'), damage_type: damageTypeSchema })
    .strict()
    .describe('Matches when the enemy resistance for damage_type is negative.'),
  z
    .object({
      kind: z.enum(['enemy_resistance_at_least', 'enemy_resistance_below']),
      damage_type: damageTypeSchema,
      value: z.number().int(),
    })
    .strict()
    .describe(
      'Matches when enemy resistance for damage_type is greater than or equal to value, or strictly below value, respectively. Negative resistance is weakness, zero is neutral, and positive resistance reduces damage.',
    ),
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

export const combatPotionIdSchema = z.enum([
  'healing_potion',
  'manastone_potion',
]);

export const tacticSchema = z
  .object({
    rules: z
      .array(
        z
          .object({
            conditions: z
              .array(tacticConditionSchema)
              .optional()
              .describe(
                'All conditions must match (AND); an omitted or empty list always matches.',
              ),
            action: tacticActionSchema,
          })
          .strict(),
      )
      .describe(
        'Evaluated from top to bottom each tick. The first matching, usable action runs; otherwise use a basic attack.',
      ),
    potion_limit: z
      .number()
      .int()
      .min(0)
      .describe(
        'Most potions one battle may use in total, capped by the bag at start. Each is consumed when used; zero disables potions.',
      ),
    potion_items: z
      .array(combatPotionIdSchema)
      .min(1)
      .refine(
        (itemIds) => new Set(itemIds).size === itemIds.length,
        'potion_items must not repeat',
      )
      .optional()
      .describe(
        'Potions in drinking order. Defaults to healing_potion, then manastone_potion.',
      ),
  })
  .strict()
  .meta({ id: 'Tactic' });

export type Tactic = z.infer<typeof tacticSchema>;

export const presetIdSchema = z.enum(['safe', 'aggressive']);
export const getTacticsSchema = z.object(characterTarget).strict();

export const setTacticsSchema = z
  .object({ ...characterTarget, tactic: tacticSchema })
  .strict();

export const validateTacticsSchema = setTacticsSchema;

export const startCombatSchema = z
  .object({
    ...characterTarget,
    enemy_id: combatIdSchema,
    preset: presetIdSchema.optional(),
    tactic: tacticSchema.optional(),
    practice: z.boolean().optional(),
  })
  .strict();

export const restSchema = z.object(characterTarget).strict();
export const stayAtInnSchema = restSchema;

export const useItemSchema = z
  .object({
    ...characterTarget,
    item_id: itemIdSchema,
    count: z.number().int().positive().optional().meta({
      description:
        'Maximum number of this item to use in this one call (default 1). The server uses only as many as still recover HP or MP, limited by the quantity you carry across qualities, and reports the number in used_item.',
    }),
  })
  .strict();

export const changeJobSchema = z
  .object({ ...characterTarget, job_id: jobSchema })
  .strict();

export const combatReportIncludeSchema = z.enum(['frames', 'preparation']);

export const getCombatReportSchema = z
  .object({
    ...characterTarget,
    activity_id: activityIdSchema,
    include: z.array(combatReportIncludeSchema).optional(),
  })
  .strict();

export const getEncountersSchema = z.object(characterTarget).strict();
export const getRaidsSchema = z.object(characterTarget).strict();
export const getLostItemsSchema = z.object(characterTarget).strict();

export const recoverLostItemsSchema = z
  .object({ ...characterTarget, drop_id: dropIdSchema })
  .strict();
