import { z } from 'zod';
import {
  characterIdSchema,
  characterTarget,
  instanceIdSchema,
  itemIdSchema,
  itemQualitySchema,
} from './ids.js';
import { locationIdSchema } from './movement.js';
import { storageTransferItemsSchema } from './storage.js';
import { unicodeTextSchema } from './text.js';

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

const houseExtensionRoomSchema = z.enum([
  'storage',
  'workshop',
  'trophy_room',
  'guest_room',
]);

export const extendHouseSchema = z
  .object({ ...characterTarget, room: houseExtensionRoomSchema })
  .strict();

// The bedroom cannot be renovated. The server also rejects the guest room,
// which has one level.
export const renovateHouseSchema = z
  .object({ ...characterTarget, room: houseExtensionRoomSchema })
  .strict();

export const houseFurnitureSlotSchema = z.enum([
  'bed',
  'chest_1',
  'chest_2',
  'chest_3',
  'chest_4',
  'chest_5',
  'chest_6',
  'chest_7',
  'chest_8',
  'station_1',
  'station_2',
  'station_3',
  'station_4',
  'decor_wall',
  'decor_floor',
  'decor_table',
  'display_1',
  'display_2',
  'display_3',
  'display_4',
  'display_5',
  'display_6',
  'guest_bed',
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

export const sleepSchema = z
  .object({
    ...characterTarget,
    max_price: z.number().int().min(0).optional(),
  })
  .strict();

export const depositHouseItemsSchema = z
  .object({ ...characterTarget, items: storageTransferItemsSchema })
  .strict();

export const withdrawHouseItemsSchema = depositHouseItemsSchema;

export const getHouseRecordOptionsSchema = z
  .object({ ...characterTarget })
  .strict();

const houseRecordKeySchema = z
  .string()
  .regex(
    /^(achievement|first_arrival|first_defeat|first_craft|raid):[a-z0-9_]+$/,
    'Use a record from get_house_record_options.',
  );

// The server also limits the slot to 5.
export const setHouseRecordSchema = z
  .object({
    ...characterTarget,
    slot: z.number().int().min(1),
    record: houseRecordKeySchema.nullable(),
  })
  .strict();

export const visitHouseSchema = z
  .object({ ...characterTarget, owner_character_id: characterIdSchema })
  .strict();

// A workshop station is rented out by its facility.
export const houseRentalSchema = z.enum([
  'alchemy',
  'furnace',
  'forge',
  'workshop',
  'guest_room',
]);

export const findHousesSchema = z
  .object({
    ...characterTarget,
    renting: houseRentalSchema,
    location_id: locationIdSchema.optional(),
  })
  .strict();

// The server also limits a fee to 100,000 gold and requires at least one of
// them. null stops renting that station or room, and an omitted fee stays as
// it is.
const houseFeeSchema = z.number().int().min(1).nullable().optional();

export const setHousePricesSchema = z
  .object({
    ...characterTarget,
    furnace_fee: houseFeeSchema,
    forge_fee: houseFeeSchema,
    workshop_fee: houseFeeSchema,
    alchemy_fee: houseFeeSchema,
    guest_fee: houseFeeSchema,
  })
  .strict();

// The server trims the text, limits it to 1,000 characters and rejects control
// characters other than line breaks and tabs. Empty text removes the
// description.
export const setHouseDescriptionSchema = z
  .object({ ...characterTarget, description: unicodeTextSchema })
  .strict();
