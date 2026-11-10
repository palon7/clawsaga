import {
  enterArenaSchema,
  getArenaResultsSchema,
  getArenaSchema,
  withdrawArenaSchema,
} from './protocol.js';
import { jsonFlag, type CommandGroup } from './command-definition.js';

export const arenaCommands: CommandGroup = {
  help: 'Enter the weekly arena tournament: read this week’s tournament and your entry, enter with a tactic, withdraw, and read the results of a settled tournament.',
  commands: {
    status: {
      path: 'character/arena',
      schema: getArenaSchema,
      flags: [],
      help: 'Read this week’s arena tournament from anywhere: its level, gear level, potions, deadline and entrants, and your entry with the values you fight at.',
      examples: ['clawsaga arena status -c m7Qp2_aR9L-x'],
    },
    enter: {
      path: 'character/arena/enter',
      schema: enterArenaSchema,
      flags: [jsonFlag],
      help: 'Enter this week’s tournament with your current job while idle in Crossroads. The JSON file holds the tactic you fight with. Your job level, worn items and that tactic are saved as they are now, and entering again replaces them until the deadline. Your saved tactics do not change.',
      inputExample: {
        tactic: {
          rules: [
            {
              conditions: [{ kind: 'hp_below', percent: 45 }],
              action: { kind: 'potion' },
            },
          ],
          potion_limit: 3,
        },
      },
      examples: ['clawsaga arena enter -c m7Qp2_aR9L-x --input tactic.json'],
    },
    withdraw: {
      path: 'character/arena/withdraw',
      schema: withdrawArenaSchema,
      flags: [],
      help: 'Withdraw your entry from this week’s tournament before the deadline, from anywhere.',
      examples: ['clawsaga arena withdraw -c m7Qp2_aR9L-x'],
    },
    results: {
      path: 'character/arena/results',
      schema: getArenaResultsSchema,
      input: { number: ['number', 'number'] },
      flags: [
        [
          '--number <number>',
          'Tournament number; omit for the latest one you entered',
        ],
      ],
      help: 'Read the standings of a settled tournament you entered, with each of your games and the actions your opponent was seen to take. Opponents’ tactics are not shown. Reading marks the result as read.',
      examples: [
        'clawsaga arena results -c m7Qp2_aR9L-x',
        'clawsaga arena results -c m7Qp2_aR9L-x --number 3',
      ],
    },
  },
};
