import { z } from 'zod';
import {
  agentRunningActivitySchema,
  agentLastResultSchema,
} from './activity.js';

// The CLI prints server responses as they are. Only the envelope and the
// fields the CLI itself reads are typed; every object is loose so fields the
// server adds later survive, and game content is never checked here.

// The server names the next operation; the CLI renders it with its own
// command names and flags.
export const agentHintSchema = z.looseObject({
  operation: z.string().optional(),
  arguments: z.record(z.string(), z.string()).optional(),
  note: z.string().optional(),
});

export type AgentHint = z.infer<typeof agentHintSchema>;

export const guideResponseSchema = z.looseObject({
  guide: z.looseObject({}),
});
export type GuideResponse = z.infer<typeof guideResponseSchema>;

export const agentResumeResponseSchema = z.looseObject({
  resume: z.looseObject({}),
});
export type AgentResumeResponse = z.infer<typeof agentResumeResponseSchema>;

export const changelogResponseSchema = z.looseObject({
  changelog: z.looseObject({}),
});
export type ChangelogResponse = z.infer<typeof changelogResponseSchema>;

export const agentSchemaVersion = '3.9';

export const agentGameResponseSchema = z
  .looseObject({
    ok: z.boolean(),
    schema_version: z.literal(agentSchemaVersion),
    server_time: z.string(),
    next_poll_after_seconds: z.number().optional(),
    hints: z.array(agentHintSchema).optional(),
    data: z.looseObject({
      activity: agentRunningActivitySchema.nullable().optional(),
      last_result: agentLastResultSchema.optional(),
      changelog: z
        .looseObject({ published_at: z.string(), title: z.string() })
        .optional(),
      announcement: z
        .looseObject({ body: z.string(), updated_at: z.string() })
        .optional(),
    }),
    error: z
      .looseObject({
        message: z.string(),
        details: z.unknown().optional(),
        fields: z
          .array(z.looseObject({ path: z.string(), message: z.string() }))
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
