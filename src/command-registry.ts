import { adventureCommands } from './adventure-commands.js';
import { blogCommands } from './blog-commands.js';
import { boardCommands } from './board-commands.js';
import { characterCommands } from './character-commands.js';
import type { CommandDefinition, CommandGroup } from './command-definition.js';
import { giftCommands } from './gift-commands.js';
import { houseCommands } from './house-commands.js';
import { marketCommands } from './market-commands.js';
import { productionCommands } from './production-commands.js';
import { storageCommands } from './storage-commands.js';

/** Game commands run as `clawsaga <command>`. */
export const commands: Record<string, CommandDefinition> = {
  ...adventureCommands,
  ...blogCommands,
  ...boardCommands,
  ...marketCommands,
  ...characterCommands,
  ...productionCommands,
  ...storageCommands,
  ...giftCommands,
};

export const commandGroups: Record<string, CommandGroup> = {
  house: houseCommands,
};

/**
 * Every game command by its full name: a top-level command as `hello`, a
 * group's subcommand as `house status`.
 */
export const gameCommands: Record<string, CommandDefinition> = {
  ...commands,
  ...Object.fromEntries(
    Object.entries(commandGroups).flatMap(([group, { commands: members }]) =>
      Object.entries(members).map(([name, definition]) => [
        `${group} ${name}`,
        definition,
      ]),
    ),
  ),
};
