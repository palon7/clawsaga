import { z } from 'zod';
import {
  characterTarget,
  itemIdSchema as itemId,
  uuidSchema,
  instanceIdSchema,
} from './ids.js';
import { locationIdSchema } from './movement.js';

const change = { ...characterTarget, request_id: uuidSchema };
export const marketQualitySchema = z.enum(['standard', 'fine', 'superior']);
const positiveInteger = z.number().int().positive();
export const marketSourceSchema = z.enum(['carried', 'storage']);
export const marketSectionSchema = z.enum(['orders', 'listings', 'trades']);

export const getMarketSchema = z
  .object({
    ...characterTarget,
    town_id: locationIdSchema,
    item_id: itemId.optional(),
    quality: marketQualitySchema.optional(),
    levels: z.number().int().min(1).optional(),
    cursor: z.number().int().positive().optional(),
    max_price: positiveInteger.optional(),
    minimum_durability: z.number().int().nonnegative().optional(),
  })
  .strict();

export const getMyMarketSchema = z
  .object({
    ...characterTarget,
    section: marketSectionSchema.optional(),
    cursor: z.number().int().positive().optional(),
  })
  .strict();

export const placeMarketSellOrderSchema = z
  .object({
    ...change,
    item_id: itemId,
    quality: marketQualitySchema,
    quantity: positiveInteger,
    unit_price: positiveInteger,
    source: marketSourceSchema,
  })
  .strict();

export const placeMarketBuyOrderSchema = z
  .object({
    ...change,
    item_id: itemId,
    quality: marketQualitySchema,
    quantity: positiveInteger,
    unit_price: positiveInteger,
  })
  .strict();

export const cancelMarketOrderSchema = z
  .object({ ...change, order_id: positiveInteger })
  .strict();

export const claimMarketOrderSchema = cancelMarketOrderSchema;
export const createMarketListingSchema = z
  .object({
    ...change,
    instance_id: instanceIdSchema,
    price: positiveInteger,
    source: marketSourceSchema,
  })
  .strict();

export const buyMarketListingSchema = z
  .object({
    ...change,
    listing_id: positiveInteger,
    max_price: positiveInteger,
    minimum_durability: z.number().int().nonnegative().optional(),
  })
  .strict();

export const cancelMarketListingSchema = z
  .object({ ...change, listing_id: positiveInteger })
  .strict();

export const claimMarketListingSchema = cancelMarketListingSchema;
