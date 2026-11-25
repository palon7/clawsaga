import {
  travelSchema,
  rideCarriageSchema,
  gatherSchema,
  fishSchema,
  readItemSchema,
  digSchema,
  getItemsSchema,
  getRecipesSchema,
  craftSchema,
  stopActivitySchema,
  getShopSchema,
  buySchema,
  equipSchema,
  repairSchema,
  discardItemSchema,
  expandBagSchema,
  repairMethodSchema,
} from './protocol.js';
import { itemQualitySchema, skillIdSchema } from './protocol/ids.js';
import { noWaitFlag, type CommandDefinition } from './command-definition.js';
import { integerFlag } from './command-input.js';

export const productionCommands: Record<string, CommandDefinition> = {
  travel: {
    path: 'character/travel',
    schema: travelSchema,
    input: { to: 'to' },
    startsActivity: true,
    walksRoute: true,
    flags: [
      [
        '--to <ids>',
        'Adjacent destination location ID, or comma-separated location IDs to walk in order from your current location',
        true,
      ],
      [
        '--no-wait',
        'Return after acceptance without waiting for arrival; --to must name one location',
      ],
    ],
    help: 'Walk one step to an adjacent location while idle and wait for arrival. With comma-separated locations, walk them in order, sending each step only after the previous arrival is confirmed. An ambush, a rejected or cancelled step, or an unconfirmed result stops the walk; repetition lists the arrived locations and the stop reason. The CLI does not search or change the route; read route and choose the locations yourself. Finish the whole command before starting another main activity.',
    examples: [
      'clawsaga travel -c m7Qp2_aR9L-x --to openpit',
      'clawsaga travel -c m7Qp2_aR9L-x --to darras,openpit',
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
      [
        '--count <number>',
        'Attempts, one at a time (default 1); with --no-wait, must be 1 or omitted',
      ],
      noWaitFlag,
    ],
    help: 'Gather the selected item at your current location while idle; wait for each completion. An ambush keeps that harvest but ends --count repetition. Finish the whole command before starting another main activity.',
    examples: [
      'clawsaga gather -c m7Qp2_aR9L-x --item herb --count 3',
      'clawsaga gather -c m7Qp2_aR9L-x --item herb --no-wait',
    ],
  },
  fish: {
    path: 'character/fish',
    schema: fishSchema,
    input: { bait: 'bait_item_id' },
    startsActivity: true,
    repeat: { requestIdPerLot: false },
    flags: [
      [
        '--bait <id>',
        'Bait item ID, one per cast: earthworm (shop), dough_bait (cooking), wolf_meat, boar_meat, or a small fish you caught whose item description says it is live bait',
        true,
      ],
      [
        '--count <number>',
        'Casts, one at a time (default 1); with --no-wait, must be 1 or omitted',
      ],
      noWaitFlag,
    ],
    help: 'Cast at a fishing spot shown by look while idle, with a fishing rod equipped; each cast uses one bait and waits for completion. One cast takes about look.fishing.base_duration_seconds, and --count runs that many casts in a row. Which fish bite depends on the bait, the time of day and the weather. Each spot has a lord of the waters, a much larger fish that bites only on live bait and only at its own times or in its own weather. Stopping a cast, or a catch that does not fit in your bag, returns the bait. Some fish bite only at a time of day or in weather that look forecasts; wait for it with wait --until. An ambush can follow a catch; it keeps that catch but ends --count repetition. Finish the whole command before starting another main activity.',
    examples: [
      'clawsaga fish -c m7Qp2_aR9L-x --bait earthworm --count 5',
      'clawsaga fish -c m7Qp2_aR9L-x --bait earthworm --no-wait',
    ],
  },
  read: {
    path: 'character/item/read',
    schema: readItemSchema,
    input: { item: 'item_id' },
    changesItems: true,
    flags: [
      [
        '--item <id>',
        'Item ID to read: an old treasure map (old_treasure_map_<tier>)',
        true,
      ],
    ],
    help: 'Read an item from your bag while idle. Reading an old treasure map uses it up and gives you a treasure map. Its clues describe the scenery of the place to dig and never name it; data.treasure_map lists them. You can hold one treasure map at a time, counting your bag and storage; dig up its treasure or discard it before reading another. Your inventory shows the current clues and the locations you already dug for them.',
    examples: ['clawsaga read -c m7Qp2_aR9L-x --item old_treasure_map_2'],
  },
  dig: {
    path: 'character/dig',
    schema: digSchema,
    startsActivity: true,
    flags: [noWaitFlag],
    help: 'Dig at your current location for the treasure of the treasure map in your bag, while idle; it takes 60 seconds. When you arrive somewhere, compare data.scenery with the clues before digging. last_result.outcome is miss (not here; a miss at a location you have not dug for these clues adds a new clue in clue, up to four clues; the fourth gives the display name, not the ID, of a location next to the place; find its ID in map --full), condition (the right place, but hint says the time of day or weather to dig here again; wait for it with wait --until), next_step (treasure_map has the clue to the next place) or treasure (gold and items are in your bag and the map is used up). If the chest does not fit in your bag, the dig ends with CAPACITY_EXCEEDED and the map stays: make room and dig here again. An ambush can follow a dig.',
    examples: [
      'clawsaga dig -c m7Qp2_aR9L-x',
      'clawsaga dig -c m7Qp2_aR9L-x --no-wait',
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
        skillIdSchema.options,
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
    help: 'Read the item catalog: list public items, search with normalized AND terms, or read one item in detail. Search is independent of inventory ownership.',
  },
  craft: {
    path: 'character/craft',
    schema: craftSchema,
    input: {
      recipe: 'recipe_id',
      maxFeePerLot: ['max_fee_per_lot', 'number'],
      useFine: 'use_fine_materials',
    },
    startsActivity: true,
    repeat: { requestIdPerLot: true },
    autoRequestId: true,
    flags: [
      ['--recipe <id>', 'Recipe ID from recipes', true],
      [
        '--use-fine',
        'Use fine intermediate materials first, then standard ones. They raise the chance of a fine or superior result for equipment and furniture',
      ],
      [
        '--max-fee-per-lot <gold>',
        'Refuse a lot whose gold fee is above this. Omit it to accept the fee the recipe lists. Required at the stations of a house you visit, where it limits the recipe fee plus the station fee',
      ],
      [
        '--count <number>',
        'Lots, one at a time (default 1); with --no-wait, must be 1 or omitted',
      ],
      [
        '--request <uuid>',
        'Retry one lot with the same ID after an uncertain craft',
      ],
      noWaitFlag,
    ],
    help: "Craft goods while idle; wait for each lot. A recipe with a facility needs that facility in town, a matching station in your house's workshop, or a rented one in the workshop of a house you visit. Only standard materials are used unless --use-fine is given. Each lot gets a new request ID. To retry one uncertain lot, keep its recipe and fee limit and use --request with --count 1. Wait for the whole command before starting another activity.",
    examples: [
      'clawsaga craft -c m7Qp2_aR9L-x --recipe wolf_jerky --count 3',
      'clawsaga craft -c m7Qp2_aR9L-x --recipe metal_ingot --max-fee-per-lot 10 --no-wait',
    ],
  },
  stop: {
    path: 'character/activity/stop',
    schema: stopActivitySchema,
    input: { activity: ['activity_id', 'number'] },
    flags: [
      [
        '-a, --activity <number>',
        'Running activity ID from activity or hello',
        true,
      ],
    ],
    help: 'Stop gathering, crafting, fishing or rest, or request combat retreat. Travel continues until arrival.',
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
    },
    autoRequestId: true,
    errorContext: (values) => ({
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
        '--instance <id>',
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
        '--instance <id>',
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
        repairMethodSchema.options,
      ],
      [
        '--instance <id>',
        'Item instance ID from inventory[].instance_id',
        true,
      ],
    ],
    help: 'Choose kit or npc repair explicitly at a town smithy while idle. Read character --include repair_estimates; each equipment row in data.inventory carries repair_estimate.kit and repair_estimate.npc with fees, durability and required kits.',
  },
  'bag-expand': {
    path: 'character/bag/expand',
    schema: expandBagSchema,
    input: { tier: ['tier', 'number'] },
    flags: [
      [
        '--tier <number>',
        'Tier to buy: one above your current bag_expansion.tier',
        true,
      ],
    ],
    help: 'Buy each unlocked tier while idle in a town with a workshop, raising maximum_weight by 10 for a one-time gold price. Read bag_expansion with character for the next capacity, price and next.unlocked. Unlocking does not purchase a tier; you still need enough gold and must meet the location and activity requirements.',
    examples: ['clawsaga bag-expand -c m7Qp2_aR9L-x --tier 1'],
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
            ...(values.quality === undefined
              ? {}
              : { quality: values.quality }),
          }
        : { kind: 'individual', instance_id: values.instance };
    },
    flags: [
      ['--item <id>', 'Stack item ID from inventory'],
      ['--quantity <number>', 'Stack quantity to discard'],
      [
        '--quality <quality>',
        'Stack quality (default standard)',
        false,
        itemQualitySchema.options,
      ],
      ['--instance <id>', 'Item instance ID from inventory'],
    ],
    help: 'Permanently discard a stack quantity (standard unless --quality is given) or one item instance while idle.',
    examples: [
      'clawsaga discard -c m7Qp2_aR9L-x --item wolf_meat --quantity 10',
      'clawsaga discard -c m7Qp2_aR9L-x --instance k3v9q2m7xa',
    ],
  },
};
