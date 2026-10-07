import {
  travelSchema,
  rideCarriageSchema,
  gatherSchema,
  getItemsSchema,
  getRecipesSchema,
  craftSchema,
  stopActivitySchema,
  getShopSchema,
  buySchema,
  equipSchema,
  repairSchema,
  discardItemSchema,
} from './protocol.js';
import { noWaitFlag, type CommandDefinition } from './command-definition.js';
import { integerFlag } from './command-input.js';

export const productionCommands: Record<string, CommandDefinition> = {
  travel: {
    path: 'character/travel',
    schema: travelSchema,
    input: { to: 'to' },
    startsActivity: true,
    flags: [
      ['--to <id>', 'Adjacent destination location ID', true],
      noWaitFlag,
    ],
    help: 'Walk one step to an adjacent location while idle and wait for arrival.',
    examples: [
      'clawsaga travel -c m7Qp2_aR9L-x --to openpit',
      'clawsaga travel -c m7Qp2_aR9L-x --to openpit --no-wait',
    ],
  },
  carriage: {
    path: 'character/carriage',
    schema: rideCarriageSchema,
    input: { to: 'to' },
    startsActivity: true,
    flags: [
      ['--to <id>', 'Destination carriage town ID from route', true],
      noWaitFlag,
    ],
    help: 'Ride the carriage from your current town to another carriage town while idle: pay the fare, arrive faster than walking, no ambush.',
    examples: [
      'clawsaga carriage -c m7Qp2_aR9L-x --to dolgan',
      'clawsaga carriage -c m7Qp2_aR9L-x --to dolgan --no-wait',
    ],
  },
  gather: {
    path: 'character/gather',
    schema: gatherSchema,
    input: { item: 'item_id' },
    startsActivity: true,
    repeat: { requestIdPerLot: false },
    flags: [
      ['--item <id>', 'Resource item ID from look', true],
      ['--count <number>', 'Attempts, one at a time (default 1)'],
      noWaitFlag,
    ],
    help: 'Gather the selected item at your current location while idle; wait for each completion. An ambush keeps that harvest but ends --count repetition. Finish the whole command before starting another main activity.',
    examples: [
      'clawsaga gather -c m7Qp2_aR9L-x --item herb --count 3',
      'clawsaga gather -c m7Qp2_aR9L-x --item herb --no-wait',
    ],
  },
  recipes: {
    path: 'character/recipes',
    schema: getRecipesSchema,
    input: { location: 'location_id', skill: 'skill_id', recipe: 'recipe_id' },
    flags: [
      ['--location <id>', 'Location used for a recipe detail estimate'],
      [
        '--skill <id>',
        'Filter the recipe list by required skill',
        false,
        [
          'mining',
          'gathering',
          'smithing',
          'crafting',
          'alchemy',
          'cooking',
          'enchanting',
        ],
      ],
      ['--recipe <id>', 'Read one recipe in detail'],
    ],
    help: 'List recipe IDs, outputs and skill requirements, or use --recipe for materials, shortages, fee, duration, facility, availability and output effects.',
  },
  items: {
    path: 'character/items',
    schema: getItemsSchema,
    input: { query: 'query', item: 'item_id' },
    flags: [
      ['--query <text>', 'Search IDs, names, descriptions, effects and stats'],
      ['--item <id>', 'Read one public item definition'],
    ],
    help: 'List public items, search with normalized AND terms, or read one item in detail. Search is independent of inventory ownership.',
  },
  craft: {
    path: 'character/craft',
    schema: craftSchema,
    input: {
      recipe: 'recipe_id',
      maxFeePerLot: ['max_fee_per_lot', 'number'],
      request: 'request_id',
    },
    startsActivity: true,
    repeat: { requestIdPerLot: true },
    autoRequestId: true,
    errorContext: (values) => ({ request_id: values.request }),
    flags: [
      ['--recipe <id>', 'Recipe ID from recipes', true],
      [
        '--max-fee-per-lot <gold>',
        'Refuse a lot whose gold fee is above this. Omit it to accept the fee the recipe lists',
      ],
      ['--count <number>', 'Lots, one at a time (default 1)'],
      [
        '--request <uuid>',
        'Retry one lot with the same ID after an uncertain craft',
      ],
      noWaitFlag,
    ],
    help: 'Craft goods from standard-quality materials while idle; wait for each lot. Each lot gets a new request ID. To retry one uncertain lot, keep its recipe and fee limit and use --request with --count 1. Wait for the whole command before starting another activity.',
    examples: [
      'clawsaga craft -c m7Qp2_aR9L-x --recipe wolf_jerky --count 3',
      'clawsaga craft -c m7Qp2_aR9L-x --recipe metal_ingot --max-fee-per-lot 10 --no-wait',
    ],
  },
  stop: {
    path: 'character/activity/stop',
    schema: stopActivitySchema,
    input: { activity: 'activity_id' },
    flags: [
      [
        '-a, --activity <id>',
        'Running activity ID from activity or hello',
        true,
      ],
    ],
    help: 'Stop gathering, crafting or rest, or request combat retreat. Travel continues until arrival.',
  },
  shop: {
    path: 'shop',
    schema: getShopSchema,
    flags: [],
    help: 'Read the shop and available stock in your current town.',
  },
  buy: {
    path: 'character/shop-purchases',
    schema: buySchema,
    input: {
      item: 'item_id',
      quantity: ['quantity', 'number'],
      maxPayment: ['max_payment', 'number'],
      request: 'request_id',
    },
    autoRequestId: true,
    errorContext: (values) => ({
      request_id: values.request,
      item_id: values.item,
      quantity: values.quantity === undefined ? 1 : Number(values.quantity),
      ...(values.maxPayment === undefined
        ? {}
        : { max_payment: Number(values.maxPayment) }),
    }),
    flags: [
      ['--item <id>', 'Item ID from shop', true],
      [
        '--quantity <number>',
        'Quantity of a stack item to buy in one purchase (default 1)',
      ],
      ['--max-payment <gold>', 'Optional maximum total payment for all items'],
      [
        '--request <uuid>',
        'Reuse the same ID and arguments after an uncertain purchase',
      ],
    ],
    help: 'Buy items while idle in one all-or-nothing purchase. Only stack items allow quantity above 1. Omit max-payment to accept the shop price, or cap the total payment. A new request ID is generated unless supplied; reuse the same ID, item and quantity after an uncertain purchase.',
  },
  equip: {
    path: 'character/equipment/equip',
    schema: equipSchema,
    input: { instance: 'instance_id' },
    flags: [
      [
        '--instance <uuid>',
        'Item instance ID from purchase.instance_id or inventory[].instance_id',
        true,
      ],
    ],
    help: 'Equip an item while idle.',
  },
  unequip: {
    path: 'character/equipment/unequip',
    schema: equipSchema,
    input: { instance: 'instance_id' },
    flags: [
      [
        '--instance <uuid>',
        'Item instance ID from inventory[].instance_id',
        true,
      ],
    ],
    help: 'Return equipment to carried inventory while idle.',
  },
  repair: {
    path: 'character/equipment/repair',
    schema: repairSchema,
    input: { instance: 'instance_id', method: 'method' },
    flags: [
      [
        '--method <kit|npc>',
        'kit: full repair using parts; npc: paid repair up to 70%, no parts. No fallback',
        true,
        ['kit', 'npc'],
      ],
      [
        '--instance <uuid>',
        'Item instance ID from inventory[].instance_id',
        true,
      ],
    ],
    help: 'Choose kit or npc repair explicitly at a town smithy while idle. Read character --include repair_estimates to compare fees, durability and required parts.',
  },
  discard: {
    path: 'character/item/discard',
    schema: discardItemSchema,
    changesItems: true,
    buildInput: (values, input) => {
      const stack = values.item !== undefined || values.quantity !== undefined;
      const individual = values.instance !== undefined;
      if (stack === individual) return;
      input.target = stack
        ? {
            kind: 'stack',
            item_id: values.item,
            quantity:
              values.quantity === undefined
                ? undefined
                : integerFlag('quantity', values.quantity),
          }
        : { kind: 'individual', instance_id: values.instance };
    },
    flags: [
      ['--item <id>', 'Stack item ID from inventory'],
      ['--quantity <number>', 'Stack quantity to discard'],
      ['--instance <uuid>', 'Item instance ID from inventory'],
    ],
    help: 'Permanently discard a standard-quality stack quantity or one item instance while idle.',
    examples: [
      'clawsaga discard -c m7Qp2_aR9L-x --item wolf_meat --quantity 10',
      'clawsaga discard -c m7Qp2_aR9L-x --instance 00000000-0000-4000-8000-000000000001',
    ],
  },
};
