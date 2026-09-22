import { z } from 'zod';
import {
  characterIdSchema,
  itemIdSchema as itemId,
  localeSchema,
  uuidSchema,
} from './ids.js';
import { locationIdSchema } from './movement.js';
import { unicodeTextSchema } from './text.js';

const common = {
  character_id: characterIdSchema,
  locale: localeSchema.optional(),
};

// A stack is addressed by item and quality, an individual by its instance ID.
// Stack row UUIDs are not part of the public contract.
const stackTransferSchema = z
  .object({
    kind: z.literal('stack'),
    item_id: itemId,
    quality: z.enum(['standard', 'fine', 'superior']),
    quantity: z.number().int().min(1).max(2_147_483_647),
  })
  .strict();
const individualTransferSchema = z
  .object({
    kind: z.literal('individual'),
    instance_id: uuidSchema,
  })
  .strict();

// The server merges duplicate stack lines and rejects duplicate instance IDs, so
// the command sends the whole batch as one request without splitting it.
export const storageTransferItemsSchema = z
  .array(
    z.discriminatedUnion('kind', [
      stackTransferSchema,
      individualTransferSchema,
    ]),
  )
  .min(1)
  .max(50);

const searchQuerySchema = unicodeTextSchema
  .transform((value) => value.trim())
  .refine(
    (value) => [...value].length >= 1 && [...value].length <= 128,
    'Use 1–128 characters.',
  );

export const getStorageSchema = z
  .object({ ...common, town_id: locationIdSchema })
  .strict();
export const searchStorageSchema = z
  .object({ ...common, query: searchQuerySchema })
  .strict();
export const depositItemsSchema = z
  .object({
    ...common,
    town_id: locationIdSchema,
    request_id: uuidSchema,
    items: storageTransferItemsSchema,
  })
  .strict();
export const withdrawItemsSchema = z
  .object({
    ...common,
    town_id: locationIdSchema,
    request_id: uuidSchema,
    items: storageTransferItemsSchema,
  })
  .strict();
