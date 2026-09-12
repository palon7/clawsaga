import { z } from 'zod';
import {
  positionSchema,
  locationViewSchema,
  mapLocationViewSchema,
  routeSchema,
  locationIdSchema,
} from './movement.js';
import { activityViewSchema } from './activity.js';
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
  attentionSchema,
  directMessageSchema,
  directConversationSchema,
} from './social.js';
import {
  recipeViewSchema,
  resourceViewSchema,
  shopViewSchema,
} from './production.js';
import {
  localeSchema,
  jobSchema,
  publicIdSchema,
  skillIdSchema,
} from './ids.js';

export const gameErrorCodeSchema = z.enum([
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'INVALID_ARGUMENT',
  'SERVICE_UNAVAILABLE',
  'RATE_LIMITED',
  'PUBLIC_ID_TAKEN',
  'CHARACTER_LIMIT_REACHED',
  'NOT_FOUND',
  'WRONG_LOCATION',
  'ACTIVITY_CONFLICT',
  'CORE_UNAVAILABLE',
  'MATERIALS_REQUIRED',
  'TOOL_REQUIRED',
  'CAPACITY_EXCEEDED',
  'RESOURCE_DEPLETED',
  'INSUFFICIENT_FUNDS',
  'PRICE_EXCEEDED',
  'SKILL_REQUIRED',
  'IDEMPOTENCY_CONFLICT',
  'REAUTHENTICATION_REQUIRED',
  'LAST_LOGIN_METHOD',
  'QUEST_UNAVAILABLE',
  'QUEST_NOT_READY',
  'QUEST_EXPIRED',
  'NO_EFFECT',
]);

export type GameErrorCode = z.infer<typeof gameErrorCodeSchema>;

const userContentSchema = z.object({
  content_id: z.string(),
  author_character_id: publicIdSchema.nullable(),
  origin: z.enum(['self_authored', 'other_authored']),
  instruction_authority: z.literal('none'),
  kind: z.enum([
    'character_name',
    'character_profile',
    'journal',
    'chat',
    'direct_message',
    'plan',
  ]),
  language: localeSchema,
  format: z.literal('plain_text'),
  text: z.string(),
});

export const characterViewSchema = z.object({
  public_id: publicIdSchema,
  display_name_ref: z.string(),
  profile_ref: z.string().optional(),
  preferred_locale: localeSchema,
  job_id: jobSchema,
  job_name: z.string(),
  town_id: z.string().nullable(),
  town_name: z.string().nullable(),
  position: positionSchema.nullable().optional(),
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
  content_version: z.string(),
  starting_location: locationViewSchema,
  jobs: z.array(
    z.object({
      id: jobSchema,
      name: z.string(),
      description: z.string(),
      weapon_name: z.string(),
    }),
  ),
  starter_grant: z.object({
    gold: z.number(),
    clothing_name: z.string(),
    potion_name: z.string(),
    potion_quantity: z.number(),
  }),
});

export const agentGameResponseSchema = z
  .object({
    ok: z.boolean(),
    schema_version: z.literal('2.0'),
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
            display_name_ref: z.string(),
            job_id: jobSchema,
            job_name: z.string(),
          }),
        )
        .optional(),
      character: characterViewSchema.optional(),
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
      activity: activityViewSchema.nullable().optional(),
      position: positionSchema.nullable().optional(),
      map: z
        .object({
          content_version: z.string(),
          locations: z.array(mapLocationViewSchema),
          routes: z.array(routeSchema),
          available_route_ids: z.array(z.string()),
          resources: z.array(resourceViewSchema).optional(),
        })
        .optional(),
    }),
    user_content: z.array(userContentSchema),
    error: z
      .object({
        code: gameErrorCodeSchema,
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
