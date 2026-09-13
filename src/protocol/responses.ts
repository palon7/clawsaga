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
import { questOfferSchema, questViewSchema } from './quests.js';
import {
  journalViewSchema,
  chatMessageSchema,
  regionIdSchema,
  planViewSchema,
  planReceiptSchema,
  attentionSchema,
  directMessageSchema,
  directConversationSchema,
} from './social.js';
import { recipeViewSchema, shopViewSchema } from './production.js';
import {
  localeSchema,
  jobSchema,
  publicIdSchema,
  skillIdSchema,
} from './ids.js';

export const characterViewSchema = z.object({
  public_id: publicIdSchema,
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
      level: z.number().int().min(1).max(20),
      experience: z.number().int().min(0).max(19000),
    }),
  ),
  skills: z.array(
    z.object({
      id: skillIdSchema,
      name: z.string(),
      level: z.number().int().min(1).max(20),
      experience: z.number().int().min(0).max(19000),
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

const itemSchema = z.object({
  id: z.string(),
  definition_id: z.string(),
  name: z.string(),
  quantity: z.number().int(),
  unit_weight: z.number().int().positive(),
  tradeable: z.boolean(),
  slot: z.enum(['main_hand', 'body', 'gathering_tool']).nullable(),
  quality: z.literal('standard').nullable(),
  durability: z.number().nullable(),
  max_durability: z.number().nullable(),
});

export type InventoryItem = z.infer<typeof itemSchema>;

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

export const nextStepSchema = z
  .object({
    operation: z.literal('hello'),
    arguments: z.object({ character_id: publicIdSchema }).strict(),
  })
  .strict();

export const profileReceiptSchema = z.object({
  preferred_locale: localeSchema,
});

export const agentGameResponseSchema = z
  .object({
    ok: z.boolean(),
    schema_version: z.literal('3.0'),
    server_time: z.iso.datetime(),
    locale: localeSchema,
    next_poll_after_seconds: z.number().int().positive().optional(),
    attention: attentionSchema.optional(),
    data: z.object({
      direct_messages: z
        .object({
          messages: z.array(directMessageSchema),
          conversations: z.array(directConversationSchema),
          next_cursor: z.number().int().positive().nullable(),
        })
        .optional(),
      mentions: z
        .object({
          messages: z.array(
            chatMessageSchema.extend({ read_at: z.iso.datetime().nullable() }),
          ),
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
          region_id: regionIdSchema,
          messages: z.array(chatMessageSchema),
          next_cursor: z.number().int().positive().nullable(),
        })
        .optional(),
      session_ended: z
        .object({
          activity_policy: z.enum(['continue', 'stop_at_boundary']),
          activity_id: z.uuid().nullable(),
        })
        .optional(),
      characters: z
        .array(
          z.object({
            public_id: publicIdSchema,
            job_id: jobSchema,
            job_name: z.string(),
            user_content: z.object({ display_name: z.string() }),
          }),
        )
        .optional(),
      character: characterViewSchema.optional(),
      created: z.object({ public_id: publicIdSchema }).optional(),
      next_step: nextStepSchema.optional(),
      profile_saved: profileReceiptSchema.optional(),
      options: optionsSchema.optional(),
      inventory: z.array(itemSchema).optional(),
      capacity: z
        .object({
          carried_weight: z.number().int().nonnegative(),
          reserved_weight: z.number().int().nonnegative(),
          maximum_weight: z.number().int().positive(),
        })
        .optional(),
      recipes: z.array(recipeViewSchema).optional(),
      shop: shopViewSchema.optional(),
      purchase: z
        .object({
          request_id: z.uuid(),
          item_id: z.string(),
          equipment_id: z.uuid(),
          paid: z.number().int().nonnegative(),
        })
        .optional(),
      activity: agentRunningActivitySchema.nullable().optional(),
      last_result: agentLastResultSchema.optional(),
      position: positionSchema.optional(),
      map: mapViewSchema.optional(),
      look: lookViewSchema.optional(),
      route: routeViewSchema.optional(),
    }),
    error: z
      .object({
        message: z.string(),
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
