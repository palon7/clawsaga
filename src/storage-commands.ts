import { CliError } from './errors.js';
import {
  getStorageSchema,
  searchStorageSchema,
  depositItemsSchema,
  withdrawItemsSchema,
} from './protocol.js';
import type { CommandDefinition } from './command-definition.js';
import type { Values } from './command-input.js';

// The batch is one JSON array option. The server validates its elements; only
// unparsable JSON is reported here.
function addItemTargets(values: Values, input: Record<string, unknown>) {
  if (values.items === undefined) return;
  try {
    input.items = JSON.parse(values.items);
  } catch {
    throw new CliError('INVALID_ARGUMENTS', { fields: ['items'] });
  }
}

function storageContext(values: Values) {
  return { request_id: values.request, town_id: values.town };
}

export const storageCommands: Record<string, CommandDefinition> = {
  storage: {
    path: 'character/storage',
    schema: getStorageSchema,
    input: { town: 'town_id' },
    flags: [['--town <id>', 'Town location ID', true]],
    help: 'Read your storage in one town from anywhere: items, weight and capacity. Unused storage is empty.',
    examples: ['clawsaga storage -c m7Qp2_aR9L-x --town selene'],
  },
  'search-storage': {
    path: 'character/storage/search',
    schema: searchStorageSchema,
    input: { query: 'query' },
    flags: [
      [
        '--query <text>',
        'Exact item ID or a case-insensitive substring of the item name',
        true,
      ],
    ],
    help: 'Find an item across every town storage you own, grouped by town. No match returns an empty list.',
    examples: ['clawsaga search-storage -c m7Qp2_aR9L-x --query ore'],
  },
  deposit: {
    path: 'character/storage/deposit',
    schema: depositItemsSchema,
    input: { town: 'town_id', request: 'request_id' },
    autoRequestId: true,
    errorContext: storageContext,
    buildInput: addItemTargets,
    flags: [
      ['--town <id>', 'Town location ID where you stand', true],
      ['--items <json>', 'JSON array of stack and individual targets', true],
      [
        '--request <uuid>',
        'Retry with the same ID, town and items after an uncertain deposit',
      ],
    ],
    help: 'Deposit items while idle in that town. The entire --items array succeeds or fails together. A request ID is generated unless supplied.',
    examples: [
      'clawsaga deposit -c m7Qp2_aR9L-x --town selene --items \'[{"kind":"stack","item_id":"ore","quality":"standard","quantity":10}]\'',
    ],
  },
  withdraw: {
    path: 'character/storage/withdraw',
    schema: withdrawItemsSchema,
    input: { town: 'town_id', request: 'request_id' },
    autoRequestId: true,
    errorContext: storageContext,
    buildInput: addItemTargets,
    flags: [
      ['--town <id>', 'Town location ID where you stand', true],
      ['--items <json>', 'JSON array of stack and individual targets', true],
      [
        '--request <uuid>',
        'Retry with the same ID, town and items after an uncertain withdrawal',
      ],
    ],
    help: 'Withdraw items while idle in that town. The entire --items array succeeds or fails together. A request ID is generated unless supplied.',
    examples: [
      'clawsaga withdraw -c m7Qp2_aR9L-x --town selene --items \'[{"kind":"individual","instance_id":"00000000-0000-4000-8000-000000000001"}]\'',
    ],
  },
};
