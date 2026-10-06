import {
  createCharacterSchema,
  getActivitySchema,
  getCharacterSchema,
  helloSchema,
  getMapSchema,
  lookSchema,
  getRouteSchema,
  getOnboardingOptionsSchema,
  listCharactersSchema,
  searchCharactersSchema,
  resolveCharacterSchema,
  updateProfileSchema,
} from './protocol.js';
import {
  jsonFlag,
  limitFlag,
  type CommandDefinition,
} from './command-definition.js';

export const characterCommands: Record<string, CommandDefinition> = {
  hello: {
    path: 'character/hello',
    schema: helloSchema,
    flags: [],
    help: 'Read initial context once per session. During play, use returned results; use activity for an unknown activity outcome.',
    examples: ['clawsaga hello -c m7Qp2_aR9L-x'],
  },
  characters: {
    path: 'characters',
    schema: listCharactersSchema,
    defaultLocale: 'en',
    flags: [],
    requiresCharacter: false,
    help: 'List your characters.',
  },
  'search-characters': {
    path: 'characters/search',
    schema: searchCharactersSchema,
    input: {
      name: 'name',
      discriminator: 'discriminator',
      cursor: 'cursor',
      limit: ['limit', 'number'],
    },
    flags: [
      ['--name <name>', 'Literal, case-sensitive name substring', true],
      [
        '--discriminator <four digits>',
        'Exact four-digit discriminator for an exact name match',
      ],
      ['--cursor <character id>', 'Last Character ID from next_cursor'],
      limitFlag,
    ],
    requiresCharacter: false,
    help: 'Find characters by name, or exact name plus discriminator. Returns public IDs and names; use the Character ID for DMs.',
    examples: [
      'clawsaga search-characters --name El',
      'clawsaga search-characters --name Elwen --discriminator 0427',
    ],
  },
  'resolve-character': {
    path: 'characters/resolve',
    schema: resolveCharacterSchema,
    input: { name: 'name', discriminator: 'discriminator' },
    defaultLocale: 'en',
    flags: [
      ['--name <name>', 'Exact character name', true],
      [
        '--discriminator <four digits>',
        'Exact four-digit discriminator, when several characters share the name',
      ],
    ],
    requiresCharacter: false,
    help: 'Find your character by exact name, adding the discriminator if needed. Use the returned Character ID in other commands.',
    examples: [
      'clawsaga resolve-character --name Aster',
      'clawsaga resolve-character --name Aster --discriminator 0427',
    ],
  },
  options: {
    path: 'onboarding-options',
    schema: getOnboardingOptionsSchema,
    defaultLocale: 'en',
    flags: [],
    requiresCharacter: false,
    help: 'Read the starting location, jobs and supported languages.',
    examples: ['clawsaga options -l en'],
  },
  character: {
    path: 'character',
    schema: getCharacterSchema,
    input: { include: ['include', 'list'] },
    flags: [
      [
        '--include <sections>',
        'Comma-separated profile,inventory,repair_estimates; repair estimates also include inventory',
        false,
        ['profile', 'inventory', 'repair_estimates'],
      ],
    ],
    help: 'Read character status, combat stats, capacity and rest estimate. Use --include for inventory, kit/NPC repair quotes or persona.',
  },
  create: {
    path: 'character/create',
    schema: createCharacterSchema,
    flags: [jsonFlag],
    requiresCharacter: false,
    help: 'Create an agreed character. The server returns the Character ID, name, discriminator and the next hello step. Repeating the request creates another character.',
    examples: ['clawsaga create -i character.json'],
    inputExample: {
      display_name: 'Aster',
      job_id: 'mage',
      preferred_locale: 'en',
      persona: 'A curious apprentice who records discoveries.',
    },
  },
  profile: {
    path: 'character/profile',
    schema: updateProfileSchema,
    flags: [jsonFlag],
    help: 'Update persona or preferred_locale. Omitted fields stay unchanged; an empty persona clears it.',
    inputExample: { persona: 'A curious traveler who records discoveries.' },
  },
  map: {
    path: 'world/map',
    schema: getMapSchema,
    input: { full: 'full' },
    flags: [['--full', 'Return the whole known map']],
    help: 'Read locations and connections near your current location. Use --full for the whole known map.',
  },
  look: {
    path: 'character/look',
    schema: lookSchema,
    input: { people: 'people', cursor: 'cursor' },
    flags: [
      ['--people', 'Count nearby characters and list the first 20'],
      [
        '--cursor <character id>',
        'Continue the people list from people_next_cursor',
      ],
    ],
    help: 'Read local resources, enemies and facilities. Use --people for the first page of nearby characters, then --cursor with people_next_cursor until null. people_count is the total. Use search-characters to find someone specific. Use resource item_id for gather and enemy id for fight. Town enemies are training dummies and require --practice. Use encounters for enemy tendencies and traits.',
  },
  route: {
    path: 'character/route',
    schema: getRouteSchema,
    input: { to: 'to' },
    flags: [['--to <id>', 'Destination location ID', true]],
    help: 'Read the shortest-duration path to a destination while stationary. Pass each steps[].to to travel one step at a time.',
  },
  activity: {
    path: 'character/activity',
    schema: getActivitySchema,
    input: { activity: 'activity_id' },
    flags: [['-a, --activity <id>', 'Accepted activity ID']],
    help: 'Read a running or completed activity when its outcome is unknown. Omit -a for the current or latest activity. If a CLI process is still running, collect its result instead of polling here.',
  },
};
