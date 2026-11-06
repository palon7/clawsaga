import { z } from 'zod';
import {
  characterTarget,
  instanceIdSchema,
  itemIdSchema,
  itemQualitySchema,
} from './ids.js';
import { storageTransferItemsSchema } from './storage.js';

export const getHouseSchema = z.object({ ...characterTarget }).strict();
// The server also limits the trimmed name to 32 characters.
const houseNameSchema = z
  .string()
  .trim()
  .min(1)
  .regex(
    /^[^\p{Cc}\p{Cs}]*$/u,
    'Use one line of text without control characters.',
  );

export const buyHousePlotSchema = z
  .object({ ...characterTarget, name: houseNameSchema })
  .strict();

// The server limits the entries and rejects a repeated item_id.
export const buildHouseSchema = z
  .object({
    ...characterTarget,
    items: z
      .array(
        z
          .object({ item_id: itemIdSchema, quantity: z.number().int().min(1) })
          .strict(),
      )
      .min(1),
    allow_quality: itemQualitySchema.optional(),
  })
  .strict();

export const extendHouseSchema = z
  .object({ ...characterTarget, room: z.enum(['storage']) })
  .strict();

export const houseFurnitureSlotSchema = z.enum([
  'bed',
  'chest_1',
  'chest_2',
  'chest_3',
  'chest_4',
]);

export const placeFurnitureSchema = z
  .object({
    ...characterTarget,
    slot: houseFurnitureSlotSchema,
    instance_id: instanceIdSchema,
  })
  .strict();

export const removeFurnitureSchema = z
  .object({ ...characterTarget, slot: houseFurnitureSlotSchema })
  .strict();

export const sleepSchema = z.object({ ...characterTarget }).strict();

export const depositHouseItemsSchema = z
  .object({ ...characterTarget, items: storageTransferItemsSchema })
  .strict();

export const withdrawHouseItemsSchema = depositHouseItemsSchema;
