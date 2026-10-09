import {
  claimGiftsSchema,
  getGiftsSchema,
  sendGiftSchema,
} from './protocol.js';
import type { CommandDefinition } from './command-definition.js';
import { addItemTargets } from './storage-commands.js';

export const giftCommands: Record<string, CommandDefinition> = {
  gifts: {
    path: 'character/gifts',
    schema: getGiftsSchema,
    input: { cursor: ['cursor', 'number'] },
    flags: [['--cursor <number>', 'next_cursor from the previous page']],
    help: 'List the gifts waiting for you from anywhere: sender, the town whose post holds them, items and gold. Everything one sender left in one town is a single entry. Claimed gifts are not listed.',
    examples: ['clawsaga gifts -c m7Qp2_aR9L-x'],
  },
  'gift-send': {
    path: 'character/gifts/send',
    schema: sendGiftSchema,
    input: {
      to: 'recipient_character_id',
      gold: ['gold', 'number'],
      request: 'request_id',
    },
    autoRequestId: true,
    errorContext: (values) => ({ request_id: values.request }),
    buildInput: addItemTargets,
    flags: [
      ['--to <id>', 'Recipient Character ID', true],
      [
        '--items <json>',
        'JSON array of items from your storage in this town: {item_id, quantity} with optional quality (default standard), or {instance_id}',
      ],
      ['--gold <amount>', 'Gold to send from your balance'],
      [
        '--request <uuid>',
        'Reuse the same ID and arguments after an uncertain result',
      ],
    ],
    help: 'Send items, gold or both to another character while idle at a post. The gift cannot be taken back: it waits at this town’s post, and the recipient claims it there. The whole gift is refused if their post in this town cannot hold it. A request ID is generated unless supplied.',
    examples: [
      'clawsaga gift-send -c m7Qp2_aR9L-x --to aB3dE6gH9jK2 --items \'[{"item_id":"ore","quantity":10}]\' --gold 120',
    ],
  },
  'gift-claim': {
    path: 'character/gifts/claim',
    schema: claimGiftsSchema,
    input: {},
    flags: [],
    help: 'Claim every gift waiting at the post of the town you are in, while idle there. Items go into your storage in this town and gold into your balance. Gifts sent in another town wait at that town’s post.',
    examples: ['clawsaga gift-claim -c m7Qp2_aR9L-x'],
  },
};
