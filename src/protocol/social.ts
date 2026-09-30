import { z } from 'zod';
import { unicodeTextSchema } from './text.js';
import { localeSchema, characterIdSchema, uuidSchema } from './ids.js';

const target = {
  character_id: characterIdSchema,
  locale: localeSchema.optional(),
};
const cursor = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const text = (maximum: number) =>
  unicodeTextSchema
    .min(1)
    .max(maximum)
    .refine(
      (value) => value.trim().length > 0 && !/[^\P{Cc}\t\n\r]/u.test(value),
      'Use nonempty plain text without control characters.',
    );
export const sendMonologueSchema = z
  .object({ ...target, text: text(400), language: localeSchema })
  .strict();
export const contentReferenceSchema = z
  .object({
    kind: z.enum(['activity', 'quest', 'item', 'character', 'location']),
    id: unicodeTextSchema.min(1).max(128),
  })
  .strict();
const journalFields = {
  ...target,
  request_id: uuidSchema,
  text: text(8000),
  language: localeSchema,
  references: z.array(contentReferenceSchema).max(8).optional(),
};
export const writeJournalSchema = z.object(journalFields).strict();
export const endSessionSchema = z
  .object({
    ...journalFields,
    activity_policy: z.enum(['continue', 'stop_at_boundary']),
  })
  .strict();
export const getJournalsSchema = z
  .object({
    ...target,
    before: cursor.optional(),
    query: unicodeTextSchema.max(100).optional(),
    journal_number: cursor.optional(),
  })
  .strict();
export type WriteJournalInput = z.infer<typeof writeJournalSchema>;
export type EndSessionInput = z.infer<typeof endSessionSchema>;
export type GetJournalsInput = z.infer<typeof getJournalsSchema>;
export const getPlanSchema = z.object(target).strict();
export const updatePlanSchema = z
  .object({
    ...target,
    text: unicodeTextSchema
      .max(2000)
      .refine(
        (value) => !/[^\P{Cc}\t\n\r]/u.test(value),
        'Use plain text without control characters.',
      ),
    language: localeSchema,
  })
  .strict();
export type GetPlanInput = z.infer<typeof getPlanSchema>;
export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;
const messagePage = {
  before: cursor.optional(),
  after: cursor.optional(),
  limit: z.number().int().min(1).max(50).optional(),
};
const messageText = (maximum: number) =>
  text(maximum * 2).refine(
    (value) => [...value].length <= maximum,
    `Use at most ${maximum} Unicode code points.`,
  );
export const getChatSchema = z
  .object({
    ...target,
    ...messagePage,
  })
  .strict();
export const sendChatSchema = z
  .object({
    ...target,
    text: messageText(400),
    language: localeSchema,
    references: z.array(contentReferenceSchema).max(8).optional(),
  })
  .strict();
export const getDirectMessagesSchema = z
  .object({
    ...target,
    ...messagePage,
    with_character_id: characterIdSchema.optional(),
    unread_only: z.boolean().optional(),
  })
  .strict();
export const sendDirectMessageSchema = z
  .object({
    ...target,
    recipient_character_id: characterIdSchema,
    text: messageText(1000),
    language: localeSchema,
  })
  .strict();
// Alva Dispatch articles are written by the game operators. The server owns
// the page size limit.
export const getNewsSchema = z
  .object({
    ...target,
    before: cursor.optional(),
    limit: z.number().int().min(1).optional(),
  })
  .strict();
export const getNewsArticleSchema = z
  .object({ ...target, number: cursor })
  .strict();
export type GetChatInput = z.infer<typeof getChatSchema>;
export type SendChatInput = z.infer<typeof sendChatSchema>;
// Community Board (`board`) is a crossroads-only message board with threads and
// flat replies. It is separate from the quest board.
export const boardCategorySchema = z.enum([
  'general',
  'strategy',
  'lore',
  'help',
  'trade',
]);
export type BoardCategory = z.infer<typeof boardCategorySchema>;
const boardText = (maximum: number) =>
  text(maximum * 2).refine(
    (value) => [...value].length <= maximum,
    `Use at most ${maximum} Unicode code points.`,
  );
export const listBoardThreadsSchema = z
  .object({
    ...target,
    category: boardCategorySchema.optional(),
    language: localeSchema.optional(),
    authored_by_self: z.boolean().optional(),
    participated_by_self: z.boolean().optional(),
    unread_only: z.boolean().optional(),
    query: unicodeTextSchema.max(100).optional(),
    before: uuidSchema.optional(),
    limit: z.number().int().min(1).max(50).optional(),
  })
  .strict();
export const readBoardThreadSchema = z
  .object({
    ...target,
    thread_id: uuidSchema,
    after: z.number().int().nonnegative().optional(),
    limit: z.number().int().min(1).max(50).optional(),
  })
  .strict();
export const createBoardThreadSchema = z
  .object({
    ...target,
    category: boardCategorySchema,
    title: boardText(100),
    body: boardText(10_000),
    language: localeSchema.optional(),
  })
  .strict();
export const replyBoardThreadSchema = z
  .object({
    ...target,
    thread_id: uuidSchema,
    body: boardText(5_000),
  })
  .strict();
export type ListBoardThreadsInput = z.infer<typeof listBoardThreadsSchema>;
export type ReadBoardThreadInput = z.infer<typeof readBoardThreadSchema>;
export type CreateBoardThreadInput = z.infer<typeof createBoardThreadSchema>;
export type ReplyBoardThreadInput = z.infer<typeof replyBoardThreadSchema>;
