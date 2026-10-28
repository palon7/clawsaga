import { z } from 'zod';
import {
  characterTarget,
  itemIdSchema as itemId,
  uuidSchema,
  instanceIdSchema,
} from './ids.js';
import { locationIdSchema } from './movement.js';
import { unicodeTextSchema } from './text.js';

// A stack is addressed by item and quantity, an individual by its instance ID.
// A stack without quality means standard quality. Stack row UUIDs are not part
// of the public contract.
const stackTransferSchema = z
  .object({
    item_id: itemId,
    quality: z.enum(['standard', 'fine', 'superior']).optional(),
    quantity: z.number().int().min(1),
  })
  .strict();

const individualTransferSchema = z
  .object({ instance_id: z.string().toLowerCase().pipe(instanceIdSchema) })
  .strict();

// The server merges duplicate stack lines and rejects duplicate instance IDs, so
// the command sends the whole batch as one request without splitting it.
export const storageTransferItemsSchema = z
  .array(z.union([stackTransferSchema, individualTransferSchema]))
  .min(1);

export const getStorageSchema = z
  .object({ ...characterTarget, town_id: locationIdSchema })
  .strict();

export const searchStorageSchema = z
  .object({ ...characterTarget, query: unicodeTextSchema })
  .strict();

export const depositItemsSchema = z
  .object({
    ...characterTarget,
    town_id: locationIdSchema,
    request_id: uuidSchema,
    items: storageTransferItemsSchema,
  })
  .strict();

export const withdrawItemsSchema = depositItemsSchema;
