import {
  buildHouseSchema,
  buyHousePlotSchema,
  depositHouseItemsSchema,
  extendHouseSchema,
  getHouseSchema,
  houseFurnitureSlotSchema,
  placeFurnitureSchema,
  removeFurnitureSchema,
  sleepSchema,
  withdrawHouseItemsSchema,
} from './protocol.js';
import { allowQualityFlag, type CommandGroup } from './command-definition.js';
import type { Values } from './command-input.js';
import { invalidArguments } from './errors.js';
import { addItemTargets } from './storage-commands.js';

const materialEntry = /^([^:]+):(\d+)$/;

/**
 * Converts `--item oak_lumber:20,metal_ingot:10` to `input.items`. Only the
 * form is checked here; the server validates the item IDs and quantities.
 */
function addMaterials(values: Values, input: Record<string, unknown>) {
  if (values.item === undefined) return;
  input.items = values.item.split(',').map((entry) => {
    const match = materialEntry.exec(entry);
    if (!match?.[1] || !match[2]) {
      throw invalidArguments(
        ['item'],
        '--item takes item_id:quantity pairs separated by commas, such as oak_lumber:20,metal_ingot:10.',
      );
    }

    return { item_id: match[1], quantity: Number(match[2]) };
  });
}

export const houseCommands: CommandGroup = {
  help: 'Own a house in a residential district: read it, buy a plot, extend and build its rooms, furnish them, sleep, and keep items in its storage room.',
  commands: {
    status: {
      path: 'character/house',
      schema: getHouseSchema,
      flags: [],
      help: 'Read your house from anywhere: its residential district, its rooms, and the materials required and delivered for a room under construction. Without a house, data.house is omitted.',
      examples: ['clawsaga house status -c m7Qp2_aR9L-x'],
    },
    buy: {
      path: 'character/house/buy',
      schema: buyHousePlotSchema,
      input: { name: 'name' },
      flags: [['--name <name>', 'House name, 1-32 characters', true]],
      help: 'Buy a house plot in the residential district you stand in while idle, and name the house. The name cannot be changed later. The price includes starting the bedroom. Each character can own one house.',
      examples: ['clawsaga house buy -c m7Qp2_aR9L-x --name "Mossy Cottage"'],
    },
    extend: {
      path: 'character/house/extend',
      schema: extendHouseSchema,
      input: { room: 'room' },
      flags: [
        [
          '--room <room>',
          'Room to add',
          true,
          extendHouseSchema.shape.room.options,
        ],
      ],
      help: 'Pay for a new room and start building it while idle at your house. The bedroom must be built and no other room under construction. Deliver its materials with house build.',
      examples: ['clawsaga house extend -c m7Qp2_aR9L-x --room storage'],
    },
    build: {
      path: 'character/house/build',
      schema: buildHouseSchema,
      input: { allowQuality: 'allow_quality' },
      buildInput: addMaterials,
      flags: [
        [
          '--item <id:qty>',
          'Comma-separated item_id:quantity pairs of materials from your bag',
          true,
        ],
        allowQualityFlag,
      ],
      help: 'Deliver materials from your bag to the room under construction while idle at your house. Only standard materials are used unless --allow-quality permits higher ones, lower qualities first; quality has no effect on the room. Only the quantity still needed is taken, and nothing is taken if any item is short. The room is built once every material is delivered.',
      examples: [
        'clawsaga house build -c m7Qp2_aR9L-x --item oak_lumber:20,metal_ingot:10',
      ],
    },
    place: {
      path: 'character/house/place',
      schema: placeFurnitureSchema,
      input: { slot: 'slot', instance: 'instance_id' },
      flags: [
        [
          '--slot <slot>',
          'Furniture slot of a built room',
          true,
          houseFurnitureSlotSchema.options,
        ],
        [
          '--instance <id>',
          'Furniture instance ID from inventory[].instance_id',
          true,
        ],
      ],
      help: 'Place furniture from your bag in a slot of a built room while idle at your house. Furniture already in the slot goes back to your bag. Moving the bed wakes you up.',
      examples: [
        'clawsaga house place -c m7Qp2_aR9L-x --slot bed --instance k3v9q2m8x1',
      ],
    },
    remove: {
      path: 'character/house/remove',
      schema: removeFurnitureSchema,
      input: { slot: 'slot' },
      flags: [
        [
          '--slot <slot>',
          'Furniture slot to empty',
          true,
          houseFurnitureSlotSchema.options,
        ],
      ],
      help: 'Move the furniture in a slot back to your bag while idle at your house. Removing the bed wakes you up.',
      examples: ['clawsaga house remove -c m7Qp2_aR9L-x --slot bed'],
    },
    sleep: {
      path: 'character/house/sleep',
      schema: sleepSchema,
      flags: [],
      help: 'Sleep in your bed while idle at your house to recover HP and MP fully and build up a sleep bonus for later experience. Starting any activity wakes you up.',
      examples: ['clawsaga house sleep -c m7Qp2_aR9L-x'],
    },
    deposit: {
      path: 'character/house/deposit',
      schema: depositHouseItemsSchema,
      buildInput: addItemTargets,
      flags: [
        ['--items <json>', 'JSON array of stack and individual targets', true],
      ],
      help: 'Deposit items from your bag in the storage room of your house while idle there. The chests placed in the room set its capacity. Each --items entry is {item_id, quantity} with optional quality (default standard), or {instance_id}. The entire array succeeds or fails together.',
      examples: [
        'clawsaga house deposit -c m7Qp2_aR9L-x --items \'[{"item_id":"ore","quantity":10}]\'',
      ],
    },
    withdraw: {
      path: 'character/house/withdraw',
      schema: withdrawHouseItemsSchema,
      buildInput: addItemTargets,
      flags: [
        ['--items <json>', 'JSON array of stack and individual targets', true],
      ],
      help: 'Withdraw items from the storage room of your house into your bag while idle there. Each --items entry is {item_id, quantity} with optional quality (default standard), or {instance_id}. The entire array succeeds or fails together.',
      examples: [
        'clawsaga house withdraw -c m7Qp2_aR9L-x --items \'[{"instance_id":"k3v9q2m7xa"}]\'',
      ],
    },
  },
};
