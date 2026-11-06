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
  'vulnerable',
  'enfeebled',
  'empowered',
  'regen',
]);

const combatActionKindSchema = z.enum([
  'attack',
  'heavy_attack',
  'defend',
  'ability',
  'potion',
  'cure',
  'none',
]);

const heavyPowerAtLeastSchema = z
  .number()
  .int()
  .min(1)
  .optional()
  .describe(
    'Match only a heavy attack of at least this power percent, as shown by next_heavy.power_percent.',
  );

export const tacticConditionSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.enum([
        'hp_below',
        'mp_below',
        'enemy_hp_below',
        'enemy_mp_below',
      ]),
      percent: z.number().int().min(1),
    })
    .strict()
    .describe(
      'Matches when the named current percentage is strictly below percent. HP percentages use current / maximum HP; MP uses its 0–100 value.',
    ),
  z
    .object({
      kind: z.literal('gauge_at_least'),
      value: z.number().int().min(1),
    })
    .strict()
    .describe('Matches when your gauge is at least value.'),
  z
    .object({
      kind: z.literal('enemy_last_action'),
      action: combatActionKindSchema,
    })
    .strict()
    .describe(
      'Matches when the enemy took this kind of action on the previous tick. A heavy attack is a charged ability released; an interrupted one counts as attack. Doing nothing, charging without acting and retreating count as none.',
    ),
  z
    .object({
      kind: z.literal('enemy_winding_up'),
      power_at_least: heavyPowerAtLeastSchema,
    })
    .strict()
    .describe(
      'Matches when the enemy heavy attack is at most two ticks away, including the tick it occurs.',
    ),
  z
    .object({
      kind: z.literal('enemy_attacking_heavy'),
      power_at_least: heavyPowerAtLeastSchema,
    })
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
      'Matches when the potions you can still drink in this battle, left in your bag and under potion_limit, are strictly below count.',
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
      kind: z.enum(['enemy_has_status', 'enemy_missing_status']),
      status: combatStatusSchema,
    })
    .strict()
    .describe(
      'Matches when the named enemy status has more than one tick left, or not; one tick left counts as missing.',
    ),
]);

const battleItemIdsSchema = z
  .array(itemIdSchema)
  .min(1)
  .refine(
    (itemIds) => new Set(itemIds).size === itemIds.length,
    'item_ids must not repeat',
  )
  .optional();

export const tacticActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.enum(['attack', 'defend', 'retreat']) }).strict(),
  z
    .object({
      kind: z.literal('potion'),
      item_ids: battleItemIdsSchema.describe(
        'Potions this rule may drink. When omitted, any potion usable in battle.',
      ),
    })
    .strict()
    .describe(
      'Drinks a potion from your bag when one remains and HP is missing: the weakest that fills the missing HP, or the strongest when none does.',
    ),
  z
    .object({
      kind: z.literal('cure'),
      item_ids: battleItemIdsSchema.describe(
        'Cure items this rule may use. When omitted, any cure item usable in battle.',
      ),
    })
    .strict()
    .describe(
      'Uses a cure item from your bag when it removes a status on you: the one that removes the most of them, then the one that removes the fewest kinds of status.',
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
        'Most potions and cure items one battle may use in total, taken from your bag as they are used. Unused items stay in the bag; zero disables both.',
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
