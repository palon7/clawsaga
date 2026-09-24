import { z } from 'zod';
import {
  characterIdSchema,
  itemIdSchema as itemId,
  localeSchema,
  timestampSchema,
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

const marketOrderPlacementSchema = z.object({
  order_id: number,
  filled_quantity: z.number().int().nonnegative(),
  remaining_quantity: z.number().int().nonnegative(),
  fills: z.array(z.object({ price, quantity })),
  market_fee: z.number().int().nonnegative(),
});
const marketListingCreatedSchema = z.object({
  listing_id: number,
  market_fee: z.number().int().positive(),
});
const marketListingPurchaseSchema = z.object({
  listing_id: number,
  instance_id: uuidSchema,
  paid: price,
});
const marketCancellationSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('order'), order_id: number }),
  z.object({ kind: z.literal('listing'), listing_id: number }),
]);
const marketClaimSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('order'),
    order_id: number,
    received_quantity: z.number().int().nonnegative(),
    refunded_gold: z.number().int().nonnegative(),
  }),
  z.object({
    kind: z.literal('listing'),
    listing_id: number,
    instance_id: uuidSchema,
  }),
]);

const priceLevel = z.tuple([price, quantity]);
const marketViewSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('overview'),
    town_id: locationIdSchema,
    items: z.array(
      z.discriminatedUnion('kind', [
        z.object({
          kind: z.literal('order_book'),
          item_id: itemId,
          name: z.string(),
          quality,
          best_bid: price.nullable(),
          best_ask: price.nullable(),
        }),
        z.object({
          kind: z.literal('listings'),
          item_id: itemId,
          name: z.string(),
          quality,
          best_bid: z.null(),
          best_ask: price,
        }),
      ]),
    ),
    next_cursor: number.nullable(),
  }),
  z.object({
    kind: z.literal('order_book'),
    town_id: locationIdSchema,
    item_id: itemId,
    quality,
    last_price: price.nullable(),
    asks: z.array(priceLevel),
    bids: z.array(priceLevel),
  }),
  z.object({
    kind: z.literal('listings'),
    town_id: locationIdSchema,
    item_id: itemId,
    listings: z.array(
      z.object({
        listing_id: number,
        price,
        quality,
        durability: z.number().int().nonnegative().nullable(),
        max_durability: z.number().int().positive().nullable(),
        successful_uses: z.number().int().nonnegative(),
      }),
    ),
    next_cursor: number.nullable(),
  }),
]);

const pending = z.enum(['receive', 'return']).nullable();
// A section is omitted when get_my_market reads only another section.
const page = <T extends z.ZodType>(entry: T) =>
  z
    .object({ entries: z.array(entry), next_cursor: number.nullable() })
    .optional();
const myMarketViewSchema = z.object({
  orders: page(
    z.object({
      order_id: number,
      town_id: locationIdSchema,
      side: z.enum(['buy', 'sell']),
      item_id: itemId,
      quality,
      unit_price: price,
      filled_quantity: z.number().int().nonnegative(),
      remaining_quantity: z.number().int().nonnegative(),
      reserved_gold: z.number().int().nonnegative(),
      market_fee: z.number().int().nonnegative(),
      status: z.enum(['OPEN', 'FILLED', 'CANCELLED', 'EXPIRED']),
      pending,
      pending_quantity: z.number().int().nonnegative(),
      expires_at: timestampSchema,
    }),
  ),
  listings: page(
    z.object({
      listing_id: number,
      town_id: locationIdSchema,
      item_id: itemId,
      price,
      market_fee: z.number().int().positive(),
      status: z.enum(['OPEN', 'SOLD', 'CANCELLED', 'EXPIRED']),
      pending,
      instance_id: uuidSchema.nullable(),
      expires_at: timestampSchema,
    }),
  ),
  trades: page(
    z.object({
      trade_id: number,
      town_id: locationIdSchema,
      item_id: itemId,
      quality,
      side: z.enum(['buy', 'sell']),
      quantity,
      unit_price: price,
      total_price: price,
      other_character_id: characterIdSchema,
      created_at: timestampSchema,
    }),
  ),
});

export const marketResponseFields = {
  order_placement: marketOrderPlacementSchema.optional(),
  listing_created: marketListingCreatedSchema.optional(),
  listing_purchase: marketListingPurchaseSchema.optional(),
  market_cancellation: marketCancellationSchema.optional(),
  market_claim: marketClaimSchema.optional(),
  market: marketViewSchema.optional(),
  my_market: myMarketViewSchema.optional(),
};
