import {
  getMarketSchema,
  getMyMarketSchema,
  placeMarketSellOrderSchema,
  placeMarketBuyOrderSchema,
  cancelMarketOrderSchema,
  claimMarketOrderSchema,
  createMarketListingSchema,
  buyMarketListingSchema,
  cancelMarketListingSchema,
  claimMarketListingSchema,
} from './protocol.js';
import type { CommandDefinition } from './command-definition.js';

const qualityChoices = ['standard', 'fine', 'superior'] as const;
const sourceChoices = ['carried', 'storage'] as const;
const requestFlag = [
  '--request <uuid>',
  'Reuse the same ID and arguments after an uncertain result',
] as const;

export const marketCommands: Record<string, CommandDefinition> = {
  market: {
    path: 'character/market',
    schema: getMarketSchema,
    flags: [
      ['--town <id>', 'Market town location ID', true],
      ['--item <id>', 'Optional item ID for board detail'],
      [
        '--quality <quality>',
        'Stack board quality (default standard) or individual listing filter',
        false,
        qualityChoices,
      ],
      ['--levels <number>', 'Price levels returned per side: 1–20 (default 5)'],
      [
        '--cursor <number>',
        'next_cursor from a previous overview or listings read',
      ],
      ['--max-price <gold>', 'Only listings at or below this price'],
      [
        '--min-durability <number>',
        'Only listings at or above this durability',
      ],
    ],
    help: 'Read every active item and quality in a market town with best bid and ask, 20 rows per page. Add --item to read one stack board or individual listings.',
    examples: [
      'clawsaga market -c m7Qp2_aR9L-x --town corvent',
      'clawsaga market -c m7Qp2_aR9L-x --town corvent --item ore --quality standard',
    ],
  },
  'my-market': {
    path: 'character/market/mine',
    schema: getMyMarketSchema,
    flags: [
      [
        '--section <section>',
        'Read only this section; required with --cursor',
        false,
        ['orders', 'listings', 'trades'],
      ],
      ['--cursor <number>', "That section's next_cursor from a previous read"],
    ],
    help: 'Read your orders, listings and trades across every market town from anywhere, newest first and 20 per section. Orders and listings include held items awaiting receipt or return.',
    examples: [
      'clawsaga my-market -c m7Qp2_aR9L-x',
      'clawsaga my-market -c m7Qp2_aR9L-x --section orders --cursor 41',
    ],
  },
  'market-sell': {
    path: 'character/market/orders/sell',
    schema: placeMarketSellOrderSchema,
    flags: [
      ['--item <id>', 'Item ID to sell', true],
      ['--quality <quality>', 'Stack quality', true, qualityChoices],
      ['--quantity <number>', 'Stack quantity to offer', true],
      ['--unit-price <gold>', 'Price per unit', true],
      [
        '--source <source>',
        'Take the stack from carried or storage',
        true,
        sourceChoices,
      ],
      requestFlag,
    ],
    help: 'Offer a quantity stack on the item and quality board while idle in a market town. New orders match crossing orders at the resting price, and the market fee applies only to the quantity left resting after that matching. A request ID is generated unless supplied.',
    examples: [
      'clawsaga market-sell -c m7Qp2_aR9L-x --item ore --quality standard --quantity 10 --unit-price 5 --source storage',
    ],
  },
  'market-buy': {
    path: 'character/market/orders/buy',
    schema: placeMarketBuyOrderSchema,
    flags: [
      ['--item <id>', 'Item ID to bid for', true],
      ['--quality <quality>', 'Stack quality', true, qualityChoices],
      ['--quantity <number>', 'Stack quantity to bid for', true],
      ['--unit-price <gold>', 'Bid price per unit', true],
      requestFlag,
    ],
    help: 'Bid for a quantity stack on the item and quality board while idle in a market town. The bid reserves gold for the resting quantity, and the market fee applies only to the quantity left resting after immediate matching. A request ID is generated unless supplied.',
    examples: [
      'clawsaga market-buy -c m7Qp2_aR9L-x --item ore --quality standard --quantity 10 --unit-price 5',
    ],
  },
  'market-order-cancel': {
    path: 'character/market/orders/cancel',
    schema: cancelMarketOrderSchema,
    flags: [
      ['--order <number>', 'Numeric order ID from my-market', true],
      requestFlag,
    ],
    help: 'Cancel one of your own orders from anywhere. Unused buy gold returns to your balance up to its limit; any excess remains claimable later. Resting sell goods move into your storage in the order town as far as they fit; the rest stays in market custody to claim. A request ID is generated unless supplied.',
    examples: ['clawsaga market-order-cancel -c m7Qp2_aR9L-x --order 12'],
  },
  'market-order-claim': {
    path: 'character/market/orders/claim',
    schema: claimMarketOrderSchema,
    flags: [
      ['--order <number>', 'Numeric order ID from my-market', true],
      requestFlag,
    ],
    help: 'Collect held items or leftover gold from one of your orders from anywhere. Items bought by a buy order can be collected while it stays open; leftover gold only after the order ends. Items move into your storage in the order town only as far as they fit, and gold only up to the balance limit; any remainder stays claimable. A request ID is generated unless supplied.',
    examples: ['clawsaga market-order-claim -c m7Qp2_aR9L-x --order 12'],
  },
  'market-list': {
    path: 'character/market/listings/create',
    schema: createMarketListingSchema,
    flags: [
      ['--instance <uuid>', 'Item instance ID from inventory', true],
      ['--price <gold>', 'Fixed price for the individual', true],
      [
        '--source <source>',
        'Take the individual from carried or storage',
        true,
        sourceChoices,
      ],
      requestFlag,
    ],
    help: 'List one transferable individual at a fixed price while idle in a market town. The listing fee is charged at creation whether or not it sells. A request ID is generated unless supplied.',
    examples: [
      'clawsaga market-list -c m7Qp2_aR9L-x --instance 22222222-2222-4222-8222-222222222222 --price 100 --source carried',
    ],
  },
  'market-purchase': {
    path: 'character/market/listings/buy',
    schema: buyMarketListingSchema,
    flags: [
      ['--listing <number>', 'Numeric listing ID from market', true],
      ['--max-price <gold>', 'Highest price you accept', true],
      ['--min-durability <number>', 'Reject an individual in worse condition'],
      requestFlag,
    ],
    help: 'Buy a fixed-price listing while idle in a market town. The individual moves straight to your bag, which needs room for it. A request ID is generated unless supplied.',
    examples: [
      'clawsaga market-purchase -c m7Qp2_aR9L-x --listing 34 --max-price 120',
    ],
  },
  'market-listing-cancel': {
    path: 'character/market/listings/cancel',
    schema: cancelMarketListingSchema,
    flags: [
      ['--listing <number>', 'Numeric listing ID from my-market', true],
      requestFlag,
    ],
    help: 'Withdraw one of your own listings from anywhere. The individual moves into your storage in the listing town if it fits; otherwise it stays in market custody to claim. A request ID is generated unless supplied.',
    examples: ['clawsaga market-listing-cancel -c m7Qp2_aR9L-x --listing 34'],
  },
  'market-listing-claim': {
    path: 'character/market/listings/claim',
    schema: claimMarketListingSchema,
    flags: [
      ['--listing <number>', 'Numeric listing ID from my-market', true],
      requestFlag,
    ],
    help: 'Collect the individual held for one of your finished listings from anywhere. It moves into your storage in the listing town only if it fits; otherwise it stays claimable. A request ID is generated unless supplied.',
    examples: ['clawsaga market-listing-claim -c m7Qp2_aR9L-x --listing 34'],
  },
};
