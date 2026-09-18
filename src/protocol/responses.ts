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
  chatChannelSchema,
  chatMessageSchema,
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
  characterIdSchema,
  discriminatorSchema,
  skillIdSchema,
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
      level: z.number().int().min(1).max(10),
      experience: z.number().int().min(0).max(4500),
    }),
  ),
  skills: z.array(
    z.object({
      id: skillIdSchema,
      name: z.string(),
      level: z.number().int().min(1).max(10),
      experience: z.number().int().min(0).max(4500),
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

const itemSchema = z.object({
  id: z.string(),
  definition_id: z.string(),
  name: z.string(),
  quantity: z.number().int(),
  unit_weight: z.number().int().positive(),
  tradeable: z.boolean(),
  slot: z
    .enum([
      'main_hand',
      'off_hand',
      'body',
      'head',
      'leg',
      'foot',
      'hands',
      'neck',
      'gathering_tool',
    ])
    .nullable(),
  quality: z.enum(['standard', 'fine', 'superior']).nullable(),
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
    topics: z.array(guideTopicSchema),
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

export const agentGameResponseSchema = z
  .object({
    ok: z.boolean(),
    schema_version: z.literal('3.1'),
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
      changelog: z
        .object({ published_at: z.string().min(1), title: z.string().min(1) })
        .optional(),
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
