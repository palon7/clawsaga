import { z } from 'zod';
import {
  characterIdSchema,
  itemIdSchema as itemId,
  localeSchema,
  uuidSchema,
} from './ids.js';
import { locationIdSchema } from './movement.js';

const common = {
  character_id: characterIdSchema,
  locale: localeSchema.optional(),
};
const change = { ...common, request_id: uuidSchema };
const quality = z.enum(['standard', 'fine', 'superior']);
const price = z.number().int().positive().max(2_147_483_647);
const quantity = z.number().int().positive().max(2_147_483_647);
const number = z.number().int().positive().safe();
const source = z.enum(['carried', 'storage']);

export const getMarketSchema = z
  .object({
    ...common,
    town_id: locationIdSchema,
    item_id: itemId.optional(),
    quality: quality.optional(),
    levels: z.number().int().min(1).max(20).optional(),
    cursor: z.number().int().positive().safe().optional(),
    max_price: price.optional(),
    minimum_durability: z.number().int().nonnegative().optional(),
  })
  .strict();
export const getMyMarketSchema = z
  .object({
    ...common,
    section: z.enum(['orders', 'listings', 'trades']).optional(),
    cursor: z.number().int().positive().safe().optional(),
  })
  .strict()
  .refine((value) => value.cursor === undefined || value.section, {
    message: 'Give section with cursor.',
    path: ['section'],
  });
export const placeMarketSellOrderSchema = z
  .object({
    ...change,
    item_id: itemId,
    quality,
    quantity,
    unit_price: price,
    source,
  })
  .strict()
  .refine((value) => value.quantity * value.unit_price <= 2_147_483_647, {
    message: 'Order total exceeds the supported maximum.',
    path: ['quantity'],
  });
export const placeMarketBuyOrderSchema = z
  .object({
    ...change,
    item_id: itemId,
    quality,
    quantity,
    unit_price: price,
  })
  .strict()
  .refine((value) => value.quantity * value.unit_price <= 2_147_483_647, {
    message: 'Order total exceeds the supported maximum.',
    path: ['quantity'],
  });
export const cancelMarketOrderSchema = z
  .object({ ...change, order_id: number })
  .strict();
export const claimMarketOrderSchema = cancelMarketOrderSchema;
export const createMarketListingSchema = z
  .object({ ...change, instance_id: uuidSchema, price, source })
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
