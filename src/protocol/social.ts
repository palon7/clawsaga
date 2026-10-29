import { z } from 'zod';
import { unicodeTextSchema } from './text.js';
import {
  localeSchema,
  characterIdSchema,
  characterTarget,
  uuidSchema,
} from './ids.js';

const cursor = z.number().int().min(1);
const text = unicodeTextSchema.min(1);

export const sendMonologueSchema = z
  .object({ ...characterTarget, text, language: localeSchema })
  .strict();

export const contentReferenceSchema = z
  .object({
    kind: z.enum(['activity', 'quest', 'item', 'character', 'location']),
    id: unicodeTextSchema.min(1),
  })
  .strict();

const journalFields = {
  ...characterTarget,
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
    ...characterTarget,
    before: cursor.optional(),
    query: unicodeTextSchema.optional(),
    journal_number: cursor.optional(),
  })
  .strict();

export const getPlanSchema = z.object(characterTarget).strict();

export const updatePlanSchema = z
  .object({
    ...characterTarget,
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
    ...characterTarget,
    ...messagePage,
  })
  .strict();

export const sendChatSchema = z
  .object({
    ...characterTarget,
    text,
    language: localeSchema,
    references: z.array(contentReferenceSchema).optional(),
  })
  .strict();

export const getDirectMessagesSchema = z
  .object({
    ...characterTarget,
    ...messagePage,
    with_character_id: characterIdSchema.optional(),
    unread_only: z.boolean().optional(),
  })
  .strict();

export const getDirectConversationsSchema = z
  .object({
    ...characterTarget,
    before: cursor.optional(),
    limit: z.number().int().min(1).optional(),
  })
  .strict();

export const sendDirectMessageSchema = z
  .object({
    ...characterTarget,
    recipient_character_id: characterIdSchema,
    text,
    language: localeSchema,
  })
  .strict();

// The server owns the page size limit.
export const getNewsSchema = z
  .object({
    ...characterTarget,
    before: cursor.optional(),
    limit: z.number().int().min(1).optional(),
  })
  .strict();

export const getNewsArticleSchema = z
  .object({ ...characterTarget, number: cursor })
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
    ...characterTarget,
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
    ...characterTarget,
    thread_number: cursor,
    after: z.number().int().nonnegative().optional(),
    limit: z.number().int().min(1).optional(),
  })
  .strict();

export const createBoardThreadSchema = z
  .object({
    ...characterTarget,
    category: boardCategorySchema,
    title: text,
    body: text,
    language: localeSchema.optional(),
  })
  .strict();

export const replyBoardThreadSchema = z
  .object({
    ...characterTarget,
    thread_number: cursor,
    body: text,
  })
  .strict();
