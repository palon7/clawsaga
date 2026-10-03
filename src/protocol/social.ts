import { z } from 'zod';
import { unicodeTextSchema } from './text.js';
import { localeSchema, characterIdSchema, uuidSchema } from './ids.js';

const target = {
  character_id: characterIdSchema,
  locale: localeSchema.optional(),
};
const cursor = z.number().int().min(1);
const text = unicodeTextSchema.min(1);
export const sendMonologueSchema = z
  .object({ ...target, text, language: localeSchema })
  .strict();
export const contentReferenceSchema = z
  .object({
    kind: z.enum(['activity', 'quest', 'item', 'character', 'location']),
    id: unicodeTextSchema.min(1),
  })
  .strict();
const journalFields = {
  ...target,
  request_id: uuidSchema,
  text,
  language: localeSchema,
  references: z.array(contentReferenceSchema).optional(),
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
    query: unicodeTextSchema.optional(),
    journal_number: cursor.optional(),
  })
  .strict();
export const getPlanSchema = z.object(target).strict();
export const updatePlanSchema = z
  .object({
    ...target,
    text: unicodeTextSchema,
    language: localeSchema,
  })
  .strict();
const messagePage = {
  before: cursor.optional(),
  after: cursor.optional(),
  limit: z.number().int().min(1).optional(),
};
export const getChatSchema = z
  .object({
    ...target,
    ...messagePage,
  })
  .strict();
export const sendChatSchema = z
  .object({
    ...target,
    text,
    language: localeSchema,
    references: z.array(contentReferenceSchema).optional(),
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
export const getDirectConversationsSchema = z
  .object({
    ...target,
    before: cursor.optional(),
    limit: z.number().int().min(1).optional(),
  })
  .strict();
export const sendDirectMessageSchema = z
  .object({
    ...target,
    recipient_character_id: characterIdSchema,
    text,
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
// Community Board (`board`) is a crossroads-only message board with threads and
// flat replies. It is separate from the quest board.
export const boardCategorySchema = z.enum([
  'general',
  'strategy',
  'lore',
  'help',
  'trade',
]);
export const listBoardThreadsSchema = z
  .object({
    ...target,
    category: boardCategorySchema.optional(),
    language: localeSchema.optional(),
    authored_by_self: z.boolean().optional(),
    participated_by_self: z.boolean().optional(),
    unread_only: z.boolean().optional(),
    query: unicodeTextSchema.optional(),
    before: cursor.optional(),
    limit: z.number().int().min(1).optional(),
  })
  .strict();
export const readBoardThreadSchema = z
  .object({
    ...target,
    thread_number: cursor,
    after: z.number().int().nonnegative().optional(),
    limit: z.number().int().min(1).optional(),
  })
  .strict();
export const createBoardThreadSchema = z
  .object({
    ...target,
    category: boardCategorySchema,
    title: text,
    body: text,
    language: localeSchema.optional(),
  })
  .strict();
export const replyBoardThreadSchema = z
  .object({
    ...target,
    thread_number: cursor,
    body: text,
  })
  .strict();
