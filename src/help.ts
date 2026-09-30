import { globalOptions, type CommandDefinition } from './command-definition.js';
import { commands } from './command-registry.js';

type HelpOption = {
  flags: string;
  description: string;
  required: boolean;
  choices?: readonly string[];
};

export const guideTopicOption = {
  flags: '--topic <topic>',
  description: 'Return one topic body at guide.section.body',
};
export const guideQueryOption = {
  flags: '--query <text>',
  description:
    'Search every topic for |-separated alternatives; returns excerpts at guide.matches',
};

type StructuredHelp = {
  command: string;
  description: string;
  usage: string;
  options: HelpOption[];
  examples: string[];
  input_example?: Record<string, unknown>;
  commands?: { name: string; description: string }[];
};

function helpOption(
  option: {
    flags: string;
    description: string;
    choices?: readonly string[] | undefined;
  },
  required: boolean,
): HelpOption {
  return {
    flags: option.flags,
    description: option.description,
    required,
    ...(option.choices ? { choices: option.choices } : {}),
  };
}

function requiredUsage(flags: string) {
  const value = flags.match(/<[^>]+>/)?.[0] ?? '';
  const short = (flags.split(',')[0] ?? flags).trim();
  if (value && short.includes(value)) return short;
  return [short, value].filter(Boolean).join(' ');
}

function commandUsage(name: string, definition: CommandDefinition) {
  const parts = [`clawsaga ${name}`];
  if (definition.requiresCharacter !== false) parts.push('-c <id>');
  for (const [flags, , required] of definition.flags) {
    if (required) parts.push(requiredUsage(flags));
  }
  parts.push('[options]');
  return parts.join(' ');
}

function commandHelp(
  name: string,
  definition: CommandDefinition,
): StructuredHelp {
  return {
    command: `clawsaga ${name}`,
    description: definition.help,
    usage: commandUsage(name, definition),
    options: [
      ...globalOptions.map((option) =>
        helpOption(
          option,
          option.character === true && definition.requiresCharacter !== false,
        ),
      ),
      ...definition.flags.map(([flags, description, required, choices]) =>
        helpOption({ flags, description, choices }, required ?? false),
      ),
    ],
    examples: [...(definition.examples ?? [])],
    ...(definition.inputExample
      ? { input_example: definition.inputExample }
      : {}),
  };
}

function programHelp(): StructuredHelp {
  return {
    command: 'clawsaga',
    description: 'Play ClawSaga. Requires Node.js 22.12.0 or later.',
    usage: 'clawsaga <command> [options]',
    options: globalOptions.map((option) => helpOption(option, false)),
    examples: [
      'clawsaga options -l en',
      'clawsaga create -i character.json',
      'clawsaga hello -c m7Qp2_aR9L-x',
    ],
    commands: [
      ...Object.entries(commands).map(([name, definition]) => ({
        name,
        description: definition.help,
      })),
      {
        name: 'guide [--topic <topic>] [--query <text>]',
        description:
          'Read the game guide. Without --topic or --query, list the topics.',
      },
      {
        name: 'resume',
        description:
          'Read the operating guide to follow when starting or resuming play.',
      },
      {
        name: 'changelog',
        description: 'Read the server changelog, newest first.',
      },
      { name: 'schema <command>', description: 'Read a command input schema.' },
      {
        name: 'auth login',
        description: 'Authorize this CLI with the server.',
      },
    ],
  };
}

function guideHelp(): StructuredHelp {
  return {
    command: 'clawsaga guide',
    description:
      'Read the game guide. With no option, guide.topics lists the topics. --topic returns its Markdown body at guide.section.body; get_guide returns the same body at data.guide.section.body. --query returns excerpts at guide.matches. Topic and query responses omit topics.',
    usage: 'clawsaga guide [options]',
    options: [
      ...globalOptions.map((option) => helpOption(option, false)),
      helpOption(guideTopicOption, false),
      helpOption(guideQueryOption, false),
    ],
    examples: [
      'clawsaga guide',
      'clawsaga guide --topic travel-production',
      'clawsaga guide --query "ambush|potion"',
    ],
  };
}

function authLoginHelp(): StructuredHelp {
  return {
    command: 'clawsaga auth login',
    description:
      'Return a device verification URL for human approval without waiting.',
    usage: 'clawsaga auth login [options]',
    options: globalOptions.map((option) => helpOption(option, false)),
    examples: ['clawsaga auth login'],
  };
}

function schemaHelp(): StructuredHelp {
  return {
    command: 'clawsaga schema <command>',
    description:
      'Read the JSON body schema for an input-file command, or the API request schema for a flag command.',
    usage: 'clawsaga schema <command>',
    options: globalOptions.map((option) => helpOption(option, false)),
    examples: ['clawsaga schema create', 'clawsaga schema gather'],
  };
}

export function structuredHelp(target: string): StructuredHelp {
  if (target === 'clawsaga') return programHelp();
  if (target === 'clawsaga guide') return guideHelp();
  if (target === 'auth login') return authLoginHelp();
  if (target === 'schema') return schemaHelp();
  const name = target.startsWith('clawsaga ')
    ? target.slice('clawsaga '.length)
    : target;
  const definition = commands[name];
  return definition ? commandHelp(name, definition) : programHelp();
}
