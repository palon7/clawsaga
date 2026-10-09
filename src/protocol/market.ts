import { z } from 'zod';
import {
  characterIdSchema,
  itemIdSchema as itemId,
  localeSchema,
  uuidSchema,
  instanceIdSchema,
} from './ids.js';
import { locationIdSchema } from './movement.js';

const common = {
  character_id: characterIdSchema,
  locale: localeSchema.optional(),
};
const change = { ...common, request_id: uuidSchema };
const quality = z.enum(['standard', 'fine', 'superior']);
const price = z.number().int().positive();
const quantity = z.number().int().positive();
const number = z.number().int().positive();
const source = z.enum(['carried', 'storage']);

export const getMarketSchema = z
  .object({
    ...common,
    town_id: locationIdSchema,
    item_id: itemId.optional(),
    quality: quality.optional(),
    levels: z.number().int().min(1).optional(),
    cursor: z.number().int().positive().optional(),
    max_price: price.optional(),
    minimum_durability: z.number().int().nonnegative().optional(),
  })
  .strict();
export const getMyMarketSchema = z
  .object({
    ...common,
    section: z.enum(['orders', 'listings', 'trades']).optional(),
    cursor: z.number().int().positive().optional(),
  })
  .strict();
export const placeMarketSellOrderSchema = z
  .object({
    ...change,
    item_id: itemId,
    quality,
    quantity,
    unit_price: price,
    source,
  })
  .strict();
export const placeMarketBuyOrderSchema = z
  .object({
    ...change,
    item_id: itemId,
    quality,
    quantity,
    unit_price: price,
  })
  .strict();
export const cancelMarketOrderSchema = z
  .object({ ...change, order_id: number })
  .strict();
export const claimMarketOrderSchema = cancelMarketOrderSchema;
export const createMarketListingSchema = z
  .object({ ...change, instance_id: instanceIdSchema, price, source })
  .strict();
export const buyMarketListingSchema = z
  .object({
    ...change,
    listing_id: number,
    max_price: price,
    minimum_durability: z.number().int().nonnegative().optional(),
  })
  .strict();
export const cancelMarketListingSchema = z
  .object({ ...change, listing_id: number })
  .strict();
export const claimMarketListingSchema = cancelMarketListingSchema;
