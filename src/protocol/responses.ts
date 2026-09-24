import { z } from 'zod';
import {
  positionSchema,
  locationViewSchema,
  mapViewSchema,
  lookViewSchema,
  routeViewSchema,
  locationIdSchema,
} from './movement.js';
import {
  agentRunningActivitySchema,
  agentLastResultSchema,
} from './activity.js';
import {
  tacticViewSchema,
  tacticIssueSchema,
  encounterViewSchema,
  combatReportSchema,
  lostItemsViewSchema,
} from './combat.js';
import {
  questBudgetStageSchema,
  questOfferSchema,
  questViewSchema,
} from './quests.js';
import {
  journalViewSchema,
  chatChannelSchema,
  chatMessageSchema,
  planViewSchema,
  planReceiptSchema,
  attentionSchema,
  directMessageSchema,
  directConversationSchema,
  boardThreadSchema,
  boardThreadSummarySchema,
  boardPostSchema,
  boardQuotaSchema,
} from './social.js';
import {
  itemSummarySchema,
  itemCatalogSchema,
  recipeCatalogSchema,
  shopViewSchema,
} from './production.js';
import { marketResponseFields } from './market.js';
import {
  localeSchema,
  jobSchema,
  characterIdSchema,
  discriminatorSchema,
  skillIdSchema,
  equipmentSlotSchema,
  itemIdSchema,
} from './ids.js';

export const characterViewSchema = z.object({
  character_id: characterIdSchema,
  discriminator: discriminatorSchema,
  preferred_locale: localeSchema,
  job_id: jobSchema,
  job_name: z.string(),
  town_id: z.string().nullable(),
  town_name: z.string().nullable(),
  position: positionSchema,
  gold: z.number().int(),
  level: z.number().int(),
  experience: z.number().int(),
  hp: z.number().int().nonnegative(),
  max_hp: z.number().int().positive(),
  mp: z.number().int().min(0).max(100),
  max_mp: z.literal(100),
  weakened_until: z.iso.datetime().nullable(),
  jobs: z.array(
    z.object({
      id: jobSchema,
      level: z.number().int().positive(),
      experience: z.number().int().nonnegative(),
    }),
  ),
  skills: z.array(
    z.object({
      id: skillIdSchema,
      name: z.string(),
      level: z.number().int().positive(),
      experience: z.number().int().nonnegative(),
      next_level_experience: z.number().int().positive().nullable(),
    }),
  ),
  reputation: z.object({
    verden: z.number(),
    eisen: z.number(),
    ordelia: z.number(),
  }),
  user_content: z.object({
    display_name: z.string(),
    persona: z.string().optional(),
  }),
});

export const characterStatusSchema = z.object({
  character_id: characterIdSchema,
  job_id: jobSchema,
  hp: z.number().int().nonnegative(),
  max_hp: z.number().int().positive(),
  mp: z.number().int().min(0).max(100),
  max_mp: z.literal(100),
  gold: z.number().int(),
  level: z.number().int(),
  experience: z.number().int(),
  weakened_until: z.iso.datetime().nullable(),
});

const repairEstimateSchema = z.object({
  available: z.boolean(),
  reason: z
    .enum([
      'busy',
      'wrong_location',
      'not_repairable',
      'no_effect',
      'insufficient_kits',
      'insufficient_funds',
    ])
    .nullable(),
  repair_kit_item_id: itemIdSchema.nullable(),
  repair_kit_name: z.string().nullable(),
  required_quantity: z.number().int().nonnegative().nullable(),
  fee: z.number().int().nonnegative().nullable(),
  durability_after: z.number().int().positive().nullable(),
});

export const inventoryRowSchema = z.discriminatedUnion('kind', [
  itemSummarySchema.extend({
    kind: z.literal('stack'),
    quantity: z.number().int().positive(),
    quality: z.enum(['standard', 'fine', 'superior']),
  }),
  itemSummarySchema
    .extend({
      kind: z.literal('individual'),
      instance_id: z.uuid(),
      quantity: z.literal(1),
      quality: z.enum(['standard', 'fine', 'superior']),
      equipment_state: z
        .object({
          durability: z.object({
            current: z.number().int().nonnegative(),
            maximum: z.number().int().positive(),
          }),
          equipped_slot: equipmentSlotSchema.nullable(),
        })
        .optional(),
      repair_estimate: repairEstimateSchema.optional(),
    })
    .superRefine((entry, context) => {
      if (entry.equipment && !entry.equipment_state)
        context.addIssue({
          code: 'custom',
          path: ['equipment_state'],
          message: 'An equipment instance requires equipment_state',
        });
      if (!entry.equipment && entry.equipment_state)
        context.addIssue({
          code: 'custom',
          path: ['equipment_state'],
          message: 'Only an equipment instance carries equipment_state',
        });
      if (!entry.equipment && entry.repair_estimate)
        context.addIssue({
          code: 'custom',
          path: ['repair_estimate'],
          message: 'Only an equipment instance has a repair estimate',
        });
    }),
]);

export type InventoryItem = z.infer<typeof inventoryRowSchema>;

const storageCapacitySchema = z.object({
  stored_weight: z.number().int().nonnegative(),
  maximum_weight: z.number().int().positive(),
});
const storageViewSchema = z.object({
  town: locationViewSchema,
  items: z.array(inventoryRowSchema),
  capacity: storageCapacitySchema,
});
const storageTransferItemViewSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('stack'),
    item_id: itemIdSchema,
    quality: z.enum(['standard', 'fine', 'superior']),
    quantity: z.number().int().positive(),
  }),
  z.object({
    kind: z.literal('individual'),
    instance_id: z.uuid(),
  }),
]);
const storageTransferViewSchema = z.object({
  request_id: z.uuid(),
  direction: z.enum(['deposit', 'withdraw']),
  town_id: locationIdSchema,
  items: z.array(storageTransferItemViewSchema).min(1).max(50),
});
const storageSearchViewSchema = z.object({
  results: z.array(
    z.object({
      town: locationViewSchema,
      items: z.array(inventoryRowSchema),
    }),
  ),
});

export const optionsSchema = z.object({
  starting_location: locationViewSchema,
  jobs: z.array(
    z.object({
      id: jobSchema,
      name: z.string(),
      description: z.string(),
    }),
  ),
  supported_locales: z.array(localeSchema),
});

// The server names the next operation; the CLI renders it with its own
// command names and flags.
export const agentHintSchema = z.union([
  z
    .object({
      operation: z.string().min(1),
      arguments: z.record(z.string(), z.string()).optional(),
    })
    .strict(),
  z.object({ note: z.string().min(1) }).strict(),
]);

export type AgentHint = z.infer<typeof agentHintSchema>;

const guideTopicSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
});

const guideMatchSchema = z.object({
  topic_id: z.string().min(1),
  title: z.string().min(1),
  heading: z.string().min(1),
  text: z.string().min(1),
  topic_body_bytes: z.number().int().positive(),
});

export const guideResponseSchema = z.object({
  guide: z.object({
    topics: z.array(guideTopicSchema).optional(),
    section: guideTopicSchema.extend({ body: z.string().min(1) }).optional(),
    matches: z.array(guideMatchSchema).optional(),
    truncated: z.boolean().optional(),
  }),
});

export const agentResumeResponseSchema = z.object({
  resume: z.object({ title: z.string().min(1), body: z.string().min(1) }),
});

export type GuideResponse = z.infer<typeof guideResponseSchema>;

export type AgentResumeResponse = z.infer<typeof agentResumeResponseSchema>;

export const changelogEntrySchema = z.object({
  id: z.number().int().positive(),
  published_at: z.string().min(1),
  title: z.string().min(1),
  body: z.string().min(1),
});

export const changelogResponseSchema = z.object({
  locale: localeSchema,
  changelog: z.object({
    entries: z.array(changelogEntrySchema),
    next_cursor: z.number().int().positive().nullable(),
  }),
});

export type ChangelogResponse = z.infer<typeof changelogResponseSchema>;

export const profileReceiptSchema = z.object({
  preferred_locale: localeSchema,
});

export const agentSchemaVersion = '3.7';

export const agentGameResponseSchema = z
  .object({
    ok: z.boolean(),
    schema_version: z.literal(agentSchemaVersion),
    server_time: z.iso.datetime(),
    next_poll_after_seconds: z.number().int().positive().optional(),
    attention: attentionSchema.optional(),
    hints: z.array(agentHintSchema).optional(),
    data: z.object({
      direct_messages: z
        .object({
          messages: z.array(directMessageSchema),
          conversations: z.array(directConversationSchema),
          next_cursor: z.number().int().positive().nullable(),
        })
        .optional(),
      monologue: z
        .object({ message_id: z.uuid(), created_at: z.iso.datetime() })
        .optional(),
      scenery: z
        .object({ location_id: locationIdSchema, text: z.string().min(1) })
        .optional(),
      tactics: tacticViewSchema.optional(),
      validation: z
        .object({ valid: z.boolean(), issues: z.array(tacticIssueSchema) })
        .optional(),
      encounters: z.array(encounterViewSchema).optional(),
      combat_report: combatReportSchema.optional(),
      lost_items: z.array(lostItemsViewSchema).optional(),
      quest_board: z.array(questOfferSchema).optional(),
      quest_board_budget: questBudgetStageSchema
        .optional()
        .describe(
          'How much the town can still post: ample, low, or halted. Rewards are paid when a quest is claimed, so the town budget can go into debt.',
        ),
      quest: questViewSchema.optional(),
      quests: z
        .object({
          entries: z.array(questViewSchema),
          next_cursor: z.number().int().positive().nullable(),
        })
        .optional(),
      journal: journalViewSchema.optional(),
      plan: planViewSchema.nullable().optional(),
      plan_saved: planReceiptSchema.optional(),
      journals: z
        .object({
          entries: z.array(journalViewSchema),
          next_cursor: z.number().int().positive().nullable(),
        })
        .optional(),
      chat: z
        .object({
          channel: chatChannelSchema,
          messages: z.array(chatMessageSchema),
          next_cursor: z.number().int().positive().nullable(),
        })
        .optional(),
      board_thread: boardThreadSchema.optional(),
      board_threads: z
        .object({
          threads: z.array(boardThreadSummarySchema),
          next_cursor: z.uuid().nullable(),
        })
        .optional(),
      board_post: boardPostSchema.optional(),
      board_quota: boardQuotaSchema.optional(),
      session_ended: z
        .object({
          activity_policy: z.enum(['continue', 'stop_at_boundary']),
          activity_id: z.uuid().nullable(),
        })
        .optional(),
      characters: z
        .array(
          z.object({
            character_id: characterIdSchema,
            discriminator: discriminatorSchema,
            job_id: jobSchema,
            job_name: z.string(),
            user_content: z.object({ display_name: z.string() }),
          }),
        )
        .optional(),
      character: characterViewSchema.optional(),
      status: characterStatusSchema.optional(),
      created: z
        .object({
          character_id: characterIdSchema,
          discriminator: discriminatorSchema,
          user_content: z.object({ display_name: z.string() }),
        })
        .optional(),
      search_results: z
        .object({
          characters: z.array(
            z.object({
              character_id: characterIdSchema,
              discriminator: discriminatorSchema,
              language: localeSchema,
              user_content: z.object({ display_name: z.string() }),
            }),
          ),
          next_cursor: characterIdSchema.nullable(),
        })
        .optional(),
      profile_saved: profileReceiptSchema.optional(),
      options: optionsSchema.optional(),
      inventory: z.array(inventoryRowSchema).optional(),
      storage: storageViewSchema.optional(),
      storage_search: storageSearchViewSchema.optional(),
      transfer: storageTransferViewSchema.optional(),
      ...marketResponseFields,
      rest_estimate: z
        .object({
          available: z.boolean(),
          reason: z.enum(['no_effect', 'busy', 'wrong_location']).nullable(),
          duration_seconds: z.number().int().nonnegative().nullable(),
        })
        .optional(),
      capacity: z
        .object({
          carried_weight: z.number().int().nonnegative(),
          reserved_weight: z.number().int().nonnegative(),
          maximum_weight: z.number().int().positive(),
        })
        .optional(),
      items: itemCatalogSchema.optional(),
      recipes: recipeCatalogSchema.optional(),
      shop: shopViewSchema.optional(),
      purchase: z
        .object({
          request_id: z.uuid(),
          item_id: z.string(),
          quality: z.enum(['standard', 'fine', 'superior']),
          quantity: z.number().int().positive(),
          paid: z.number().int().nonnegative(),
          instance_id: z.uuid().optional(),
        })
        .optional(),
      repair: z
        .object({
          instance_id: z.uuid(),
          durability: z.object({
            current: z.number().int().nonnegative(),
            maximum: z.number().int().positive(),
          }),
          kits_used: z.number().int().nonnegative(),
          fee_paid: z.number().int().nonnegative(),
        })
        .optional(),
      activity: agentRunningActivitySchema.nullable().optional(),
      last_result: agentLastResultSchema.optional(),
      position: positionSchema.optional(),
      map: mapViewSchema.optional(),
      look: lookViewSchema.optional(),
      route: routeViewSchema.optional(),
      changelog: z
        .object({ published_at: z.string().min(1), title: z.string().min(1) })
        .optional(),
      announcement: z
        .object({ body: z.string().min(1), updated_at: z.string().min(1) })
        .optional(),
    }),
    error: z
      .object({
        message: z.string(),
        details: z
          .object({
            kind: z.literal('delivery_shortage'),
            item_id: itemIdSchema,
            required: z.number().int().positive(),
            owned: z.number().int().nonnegative(),
            missing: z.number().int().positive(),
          })
          .optional(),
        fields: z
          .array(z.object({ path: z.string(), message: z.string() }))
          .optional(),
        retry_after_seconds: z.number().optional(),
      })
      .optional(),
  })
  .refine((response) => response.ok === (response.error === undefined), {
    path: ['error'],
    message: 'A failure requires an error; a success must not contain one',
  });

export type AgentGameResponse = z.infer<typeof agentGameResponseSchema>;

export type CharacterView = z.infer<typeof characterViewSchema>;

export type OnboardingOptions = z.infer<typeof optionsSchema>;
