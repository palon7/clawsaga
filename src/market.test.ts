import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { execute } from './commands.js';
import { GameClient } from './client.js';
import { CliError } from './errors.js';
import { agentGameResponseSchema } from './protocol.js';

beforeEach(() =>
  vi.stubGlobal('fetch', () => Promise.reject(new Error('offline'))),
);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const character = 'm7Qp2_aR9L-x';
const instance = '22222222-2222-4222-8222-222222222222';
const envelope = {
  schema_version: '3.7',
  server_time: '2026-09-20T00:00:00.000Z',
} as const;

const orderBook = {
  ok: true,
  ...envelope,
  data: {
    market: {
      kind: 'order_book',
      town_id: 'corvent',
      item_id: 'ore',
      quality: 'fine',
      last_price: 12,
      asks: [
        [12, 30],
        [13, 5],
      ],
      bids: [[11, 20]],
    },
  },
} as const;

const overview = {
  ok: true,
  ...envelope,
  data: {
    market: {
      kind: 'overview',
      town_id: 'corvent',
      items: [
        {
          kind: 'order_book',
          item_id: 'ore',
          name: 'Iron Ore',
          quality: 'fine',
          best_bid: 11,
          best_ask: 12,
        },
      ],
      next_cursor: null,
    },
  },
} as const;

const listings = {
  ok: true,
  ...envelope,
  data: {
    market: {
      kind: 'listings',
      town_id: 'corvent',
      item_id: 'iron_sword',
      listings: [
        {
          listing_id: 34,
          price: 100,
          quality: 'fine',
          durability: 40,
          max_durability: 60,
          successful_uses: 2,
        },
      ],
      next_cursor: 34,
    },
  },
} as const;

const myMarket = {
  ok: true,
  ...envelope,
  data: {
    my_market: {
      orders: {
        entries: [
          {
            order_id: 7,
            town_id: 'corvent',
            side: 'sell',
            item_id: 'ore',
            quality: 'standard',
            unit_price: 12,
            filled_quantity: 0,
            remaining_quantity: 30,
            reserved_gold: 0,
            market_fee: 2,
            status: 'OPEN',
            pending: null,
            pending_quantity: 0,
            expires_at: '2026-10-01T00:00:00.000Z',
          },
        ],
        next_cursor: null,
      },
      listings: {
        entries: [
          {
            listing_id: 34,
            town_id: 'corvent',
            item_id: 'iron_sword',
            price: 100,
            market_fee: 5,
            status: 'SOLD',
            pending: 'receive',
            instance_id: instance,
            expires_at: '2026-10-01T00:00:00.000Z',
          },
        ],
        next_cursor: null,
      },
      trades: {
        entries: [
          {
            trade_id: 2,
            town_id: 'corvent',
            item_id: 'ore',
            quality: 'standard',
            side: 'buy',
            quantity: 10,
            unit_price: 12,
            total_price: 120,
            other_character_id: 'abcdefghijkl',
            created_at: '2026-09-20T00:00:00.000Z',
          },
        ],
        next_cursor: null,
      },
    },
  },
} as const;

const placement = {
  ok: true,
  ...envelope,
  data: {
    order_placement: {
      order_id: 7,
      filled_quantity: 5,
      remaining_quantity: 5,
      fills: [{ price: 10, quantity: 5 }],
      market_fee: 1,
    },
  },
} as const;

const purchase = {
  ok: true,
  ...envelope,
  data: {
    listing_purchase: { listing_id: 34, instance_id: instance, paid: 120 },
  },
} as const;

it('reads every active item without an item filter', async () => {
  const invoke = vi
    .spyOn(GameClient.prototype, 'invoke')
    .mockResolvedValue(structuredClone(overview) as never);
  const result = await execute(
    ['market', '-c', character, '--town', 'corvent'],
    vi.fn(),
  );
  expect(invoke.mock.calls[0]![1]).toEqual({
    character_id: character,
    town_id: 'corvent',
  });
  expect(agentGameResponseSchema.parse(result)).toEqual(result);
});

it('reads one board remotely and maps every optional filter to typed numbers', async () => {
  const invoke = vi
    .spyOn(GameClient.prototype, 'invoke')
    .mockResolvedValue(structuredClone(orderBook) as never);
  const result = await execute(
    [
      'market',
      '-c',
      character,
      '--town',
      'corvent',
      '--item',
      'ore',
      '--quality',
      'fine',
      '--levels',
      '5',
      '--cursor',
      '7',
      '--max-price',
      '120',
      '--min-durability',
      '3',
    ],
    vi.fn(),
  );
  expect(invoke.mock.calls[0]![0]).toBe('character/market');
  expect(invoke.mock.calls[0]![1]).toEqual({
    character_id: character,
    town_id: 'corvent',
    item_id: 'ore',
    quality: 'fine',
    levels: 5,
    cursor: 7,
    max_price: 120,
    minimum_durability: 3,
  });
  expect(agentGameResponseSchema.parse(result)).toEqual(result);
});

it('reads listings with their pagination cursor', async () => {
  const invoke = vi
    .spyOn(GameClient.prototype, 'invoke')
    .mockResolvedValue(structuredClone(listings) as never);
  const result = await execute(
    ['market', '-c', character, '--town', 'corvent', '--item', 'iron_sword'],
    vi.fn(),
  );
  expect(invoke.mock.calls[0]![1]).toEqual({
    character_id: character,
    town_id: 'corvent',
    item_id: 'iron_sword',
  });
  expect(agentGameResponseSchema.parse(result)).toEqual(result);
});

it('reads own orders, held items and trades from anywhere', async () => {
  const invoke = vi
    .spyOn(GameClient.prototype, 'invoke')
    .mockResolvedValue(structuredClone(myMarket) as never);
  const result = await execute(
    ['my-market', '-c', character, '--section', 'trades', '--cursor', '9'],
    vi.fn(),
  );
  expect(invoke.mock.calls[0]![0]).toBe('character/market/mine');
  expect(invoke.mock.calls[0]![1]).toEqual({
    character_id: character,
    section: 'trades',
    cursor: 9,
  });
  expect(agentGameResponseSchema.parse(result)).toEqual(result);
});

it('posts each write to its order or listing path with a request ID', async () => {
  const invoke = vi
    .spyOn(GameClient.prototype, 'invoke')
    .mockResolvedValue(structuredClone(placement) as never);
  const request = '44444444-4444-4444-8444-444444444444';
  await execute(
    [
      'market-sell',
      '-c',
      character,
      '--item',
      'ore',
      '--quality',
      'standard',
      '--quantity',
      '10',
      '--unit-price',
      '5',
      '--source',
      'storage',
    ],
    vi.fn(),
  );
  expect(invoke.mock.calls[0]![0]).toBe('character/market/orders/sell');
  const sell = invoke.mock.calls[0]![1] as Record<string, unknown>;
  expect(sell).toMatchObject({
    character_id: character,
    item_id: 'ore',
    quality: 'standard',
    quantity: 10,
    unit_price: 5,
    source: 'storage',
  });
  expect(sell.request_id).toMatch(/^[0-9a-f-]{36}$/);

  await execute(
    [
      'market-buy',
      '-c',
      character,
      '--item',
      'ore',
      '--quality',
      'standard',
      '--quantity',
      '10',
      '--unit-price',
      '5',
    ],
    vi.fn(),
  );
  expect(invoke.mock.calls[1]![0]).toBe('character/market/orders/buy');

  await execute(
    [
      'market-list',
      '-c',
      character,
      '--instance',
      instance,
      '--price',
      '100',
      '--source',
      'carried',
      '--request',
      request,
    ],
    vi.fn(),
  );
  expect(invoke.mock.calls[2]![0]).toBe('character/market/listings/create');
  expect(invoke.mock.calls[2]![1]).toEqual({
    character_id: character,
    instance_id: instance,
    price: 100,
    source: 'carried',
    request_id: request,
  });

  await execute(
    ['market-listing-cancel', '-c', character, '--listing', '34'],
    vi.fn(),
  );
  expect(invoke.mock.calls[3]![0]).toBe('character/market/listings/cancel');
  expect(invoke.mock.calls[3]![1]).toMatchObject({ listing_id: 34 });

  await execute(
    ['market-order-claim', '-c', character, '--order', '7'],
    vi.fn(),
  );
  expect(invoke.mock.calls[4]![0]).toBe('character/market/orders/claim');
  expect(invoke.mock.calls[4]![1]).toMatchObject({ order_id: 7 });
});

it('posts a purchase with numeric bounds and parses the accepted purchase', async () => {
  const invoke = vi
    .spyOn(GameClient.prototype, 'invoke')
    .mockResolvedValue(structuredClone(purchase) as never);
  const result = await execute(
    [
      'market-purchase',
      '-c',
      character,
      '--listing',
      '34',
      '--max-price',
      '120',
      '--min-durability',
      '5',
    ],
    vi.fn(),
  );
  expect(invoke.mock.calls[0]![0]).toBe('character/market/listings/buy');
  expect(invoke.mock.calls[0]![1]).toMatchObject({
    character_id: character,
    listing_id: 34,
    max_price: 120,
    minimum_durability: 5,
    request_id: expect.any(String),
  });
  expect(agentGameResponseSchema.parse(result)).toEqual(result);
});

it('keeps the request ID and target in an uncertain error and rejects a malformed number first', async () => {
  const invoke = vi
    .spyOn(GameClient.prototype, 'invoke')
    .mockRejectedValue(
      new CliError('SERVICE_UNAVAILABLE', { outcome: 'unknown' }),
    );
  await expect(
    execute(['market-order-cancel', '-c', character, '--order', '12'], vi.fn()),
  ).rejects.toMatchObject({
    code: 'SERVICE_UNAVAILABLE',
    detail: { request_id: expect.any(String), order_id: 12 },
  });
  invoke.mockClear();
  await expect(
    execute(
      [
        'market-sell',
        '-c',
        character,
        '--item',
        'ore',
        '--quality',
        'standard',
        '--quantity',
        'two',
        '--unit-price',
        '5',
        '--source',
        'carried',
      ],
      vi.fn(),
    ),
  ).rejects.toMatchObject({ code: 'INVALID_ARGUMENTS' });
  expect(invoke).not.toHaveBeenCalled();
});

it('parses the market slot-limit failure body', () => {
  const limitReached = {
    ok: false,
    ...envelope,
    data: {},
    error: {
      message:
        'You have 100 active market orders or listings. Cancel one, or claim held items to free a slot.',
    },
  };
  expect(agentGameResponseSchema.safeParse(limitReached).success).toBe(true);
});
