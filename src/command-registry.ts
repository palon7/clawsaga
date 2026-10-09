import { adventureCommands } from './adventure-commands.js';
import { boardCommands } from './board-commands.js';
import { characterCommands } from './character-commands.js';
import type { CommandDefinition } from './command-definition.js';
import { giftCommands } from './gift-commands.js';
import { marketCommands } from './market-commands.js';
import { productionCommands } from './production-commands.js';
import { storageCommands } from './storage-commands.js';

export const commands: Record<string, CommandDefinition> = {
  ...adventureCommands,
  ...boardCommands,
  ...marketCommands,
  ...characterCommands,
  ...productionCommands,
  ...storageCommands,
  ...giftCommands,
};
