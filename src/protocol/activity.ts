import { z } from 'zod';

// The CLI reads only the fields below to wait for and repeat activities.
// The server owns the rest of an activity, so it passes through untouched.
export const agentRunningActivitySchema = z.looseObject({
  kind: z.string(),
  activity_id: z.number(),
  started_at: z.string(),
  completes_at: z.string().optional(),
  arrives_at: z.string().optional(),
  time_limit_at: z.string().optional(),
});
export type AgentRunningActivity = z.infer<typeof agentRunningActivitySchema>;

export const agentLastResultSchema = z.looseObject({
  kind: z.string(),
  activity_id: z.number(),
  status: z.string().optional(),
  end_reason: z.string().optional(),
  output: z
    .looseObject({ item_id: z.string(), quantity: z.number() })
    .optional(),
  ambush: z.looseObject({ activity_id: z.number() }).optional(),
});
export type AgentLastResult = z.infer<typeof agentLastResultSchema>;
