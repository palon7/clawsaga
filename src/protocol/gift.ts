import { z } from 'zod';
import { characterIdSchema, localeSchema, uuidSchema } from './ids.js';
import { storageTransferItemsSchema } from './storage.js';

const common = {
  character_id: characterIdSchema,
  locale: localeSchema.optional(),
};

// Items come from the storage of the town the character stands in, so no town
// is sent. The server requires items, gold or both.
export const sendGiftSchema = z
  .object({
    ...common,
    recipient_character_id: characterIdSchema,
    request_id: uuidSchema,
    items: storageTransferItemsSchema.optional(),
    gold: z.number().int().min(1).optional(),
  })
  .strict();
export const claimGiftsSchema = z.object(common).strict();
export const getGiftsSchema = z
  .object({ ...common, cursor: z.number().int().positive().optional() })
  .strict();
