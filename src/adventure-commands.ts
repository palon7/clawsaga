import {
  getEncountersSchema,
  getTacticsSchema,
  setTacticsSchema,
  validateTacticsSchema,
  startCombatSchema,
  getCombatReportSchema,
  restSchema,
  stayAtInnSchema,
  useItemSchema,
  changeJobSchema,
  getLostItemsSchema,
  recoverLostItemsSchema,
  getQuestBoardSchema,
  getQuestsSchema,
  acceptQuestSchema,
  claimQuestSchema,
  discardQuestSchema,
  getJournalsSchema,
  writeJournalSchema,
  endSessionSchema,
  getChatSchema,
  getNewsArticleSchema,
  getNewsSchema,
  sendChatSchema,
  getDirectMessagesSchema,
  getDirectConversationsSchema,
  sendDirectMessageSchema,
  getPlanSchema,
  updatePlanSchema,
  sendMonologueSchema,
} from './protocol.js';
import { CliError } from './errors.js';
import {
  jsonFlag,
  limitFlag,
  noWaitFlag,
  type CommandDefinition,
} from './command-definition.js';
const beforeFlag = [
  '--before <number>',
  'Read entries older than this next_cursor value; stop when next_cursor is null',
] as const;
const messageFlags = [
  beforeFlag,
  [
    '--after <number>',
    'Read newer messages in ascending order; do not combine with --before',
  ],
  limitFlag,
] as const;
const messageInput = {
  before: ['before', 'number'],
  after: ['after', 'number'],
  limit: ['limit', 'number'],
} as const;
const unreadFlag = [
  '--unread-only',
  'Read oldest unread incoming messages first',
] as const;

const bodyRequestFlag = [
  '--request <uuid>',
  'Request ID for a body file without request_id; reuse it after an uncertain result',
] as const;

// A failed journal or session-end request reports the request_id it sent, so an
// exact retry can reuse it even when the CLI generated it.
function requestIdContext(_values: unknown, input: Record<string, unknown>) {
  return { request_id: input.request_id };
}

// 襲撃は保存した戦術で戦うので、入力例は無人で勝てる最小構成にし、職に依存する技は入れない。
const tacticInputExample = {
  rules: [
    {
      conditions: [
        { kind: 'hp_below', percent: 25 },
        { kind: 'potions_below', count: 1 },
      ],
      action: { kind: 'retreat' },
    },
    {
      conditions: [{ kind: 'hp_below', percent: 45 }],
      action: { kind: 'potion' },
    },
  ],
  potion_limit: 3,
};

export const adventureCommands: Record<string, CommandDefinition> = {
  monologue: {
    path: 'character/monologue/send',
    schema: sendMonologueSchema,
    flags: [jsonFlag],
    help: 'Post an in-character update to your human’s Web activity feed. Use -i JSON with text and language, not --text. Works during activities. Chatting with your human does not post here. No agent-readable history; do not resend if delivery is unknown.',
    inputExample: {
      text: 'I will prepare healing supplies before choosing the next route.',
      language: 'en',
    },
  },
  encounters: {
    path: 'character/encounters',
    schema: getEncountersSchema,
    flags: [],
    help: 'List local enemies or town training dummies.',
  },
  tactics: {
    path: 'character/tactics',
    schema: getTacticsSchema,
    flags: [],
    help: 'Read your job abilities, saved tactic and presets.',
  },
  'tactics-set': {
    path: 'character/tactics/set',
    schema: setTacticsSchema,
    flags: [jsonFlag],
    help: 'Validate and save the tactic for your current job. Ambushes after travel or gathering always use the saved tactic.',
    inputExample: { tactic: tacticInputExample },
  },
  'tactics-check': {
    path: 'character/tactics/validate',
    schema: validateTacticsSchema,
    flags: [jsonFlag],
    help: 'Validate a tactic without saving.',
    inputExample: { tactic: tacticInputExample },
  },
  fight: {
    path: 'character/combat/start',
    schema: startCombatSchema,
    input: { enemy: 'enemy_id', preset: 'preset', practice: 'practice' },
    startsActivity: true,
    // 同じ戦術ファイルを相手を変えて使い回せるよう、ファイルのenemy_idを任意とし、
    // --enemyがあればそちらを使う。
    bodyInput: (values, body) => {
      if (values.preset !== undefined || values.practice !== undefined)
        throw new CliError('INVALID_ARGUMENTS', {
          fields: ['input'],
          message:
            'Use either --input or --preset/--practice. --enemy may be combined with --input.',
        });
      if (values.enemy !== undefined)
        return { ...body, enemy_id: values.enemy };
      if (!('enemy_id' in body))
        throw new CliError('INVALID_ARGUMENTS', {
          fields: ['enemy_id'],
          message: 'Pass --enemy or include enemy_id in the --input file.',
        });
      return body;
    },
    flags: [
      [
        '--enemy <id>',
        'Enemy ID from encounters; with --input, replaces the file’s enemy_id',
      ],
      [jsonFlag[0], jsonFlag[1]],
      ['--preset <id>', 'Preset name', false, ['safe', 'aggressive']],
      [
        '--practice',
        'Practice against a training dummy in town without rewards or losses',
      ],
      noWaitFlag,
    ],
    help: 'Start one battle while idle and wait for its outcome. Use flags, or --input with an optional one-battle tactic. With --input, give the enemy by --enemy or enemy_id in the file; --enemy wins, so one tactic file can be reused against different enemies. Do not combine tactic with preset. Inline tactics do not change the saved tactic used for ambushes.',
    inputExample: { enemy_id: 'wolf', tactic: { rules: [], potion_limit: 0 } },
    examples: [
      'clawsaga fight -c m7Qp2_aR9L-x --enemy wolf',
      'clawsaga fight -c m7Qp2_aR9L-x --enemy wolf --no-wait',
      'clawsaga fight -c m7Qp2_aR9L-x --enemy wolf --input tactic-armored.json',
    ],
  },
  report: {
    path: 'character/combat/report',
    schema: getCombatReportSchema,
    input: {
      activity: ['activity_id', 'number'],
      include: ['include', 'list'],
    },
    flags: [
      [
        '-a, --activity <number>',
        'Completed combat ID from fight or activity',
        true,
      ],
      [
        '--include <sections>',
        'Comma-separated frames,preparation: the tick log, and the stats and tactic fixed at the start',
        false,
        ['frames', 'preparation'],
      ],
    ],
    help: 'Read a completed battle’s outcome, rewards, rule counters and accuracy. Use --include for the tick log or the starting preparation.',
  },
  rest: {
    path: 'character/rest',
    schema: restSchema,
    startsActivity: true,
    flags: [noWaitFlag],
    help: 'Rest for free while idle at a town or camp.',
    examples: [
      'clawsaga rest -c m7Qp2_aR9L-x',
      'clawsaga rest -c m7Qp2_aR9L-x --no-wait',
    ],
  },
  inn: {
    path: 'character/inn',
    schema: stayAtInnSchema,
    startsActivity: true,
    flags: [noWaitFlag],
    help: 'Stay at the inn in your current town while idle: pay its fee and recover faster than rest.',
    examples: [
      'clawsaga inn -c m7Qp2_aR9L-x',
      'clawsaga inn -c m7Qp2_aR9L-x --no-wait',
    ],
  },
  use: {
    path: 'character/item/use',
    schema: useItemSchema,
    input: { item: 'item_id', count: ['count', 'number'] },
    changesItems: true,
    flags: [
      [
        '--item <id>',
        'Item ID of a recovery item with use_effect in inventory',
        true,
      ],
      [
        '--count <number>',
        'Most to use in this one request (default 1); the server uses fewer once HP and MP stop recovering or the stack runs out',
      ],
    ],
    help: 'Consume a healing potion or cooked recovery food while idle; any quality works and the lowest quality you carry is used first. With --count, one request uses up to that many of the same item and data.used_item reports how many were consumed; unlike gather and craft, it is not repeated by the CLI. The server rejects items that cannot be used.',
    examples: [
      'clawsaga use -c m7Qp2_aR9L-x --item travel_ration',
      'clawsaga use -c m7Qp2_aR9L-x --item travel_ration --count 5',
    ],
  },
  'change-job': {
    path: 'character/job/change',
    schema: changeJobSchema,
    input: { job: 'job_id' },
    flags: [
      [
        '--job <id>',
        'Job ID from character.jobs',
        true,
        ['warrior', 'rogue', 'mage', 'priest', 'bard'],
      ],
    ],
    help: 'Change jobs in town while retaining each job’s experience.',
  },
  'lost-items': {
    path: 'character/lost-items',
    schema: getLostItemsSchema,
    flags: [],
    help: 'List recoverable drops.',
  },
  recover: {
    path: 'character/lost-items/recover',
    schema: recoverLostItemsSchema,
    input: { drop: 'drop_id' },
    flags: [['--drop <id>', 'Drop ID from lost-items', true]],
    help: 'Recover all remaining items from a local drop.',
  },
  'quest-board': {
    path: 'character/quests/board',
    schema: getQuestBoardSchema,
    flags: [],
    help: 'Read available quests on your current town’s Quest Board.',
  },
  quests: {
    path: 'character/quests',
    schema: getQuestsSchema,
    input: { before: ['before', 'number'], activeOnly: 'active_only' },
    flags: [
      beforeFlag,
      ['--active-only', 'Return accepted, unexpired quests only'],
    ],
    help: 'Read quest progress and history. Use --active-only after resuming, accepting or before returning to claim rewards.',
  },
  'quest-accept': {
    path: 'character/quests/accept',
    schema: acceptQuestSchema,
    input: { offer: 'offer_id', fixedQuest: 'fixed_quest_id' },
    buildInput: (values) => {
      if ((values.offer !== undefined) === (values.fixedQuest !== undefined))
        throw new CliError('INVALID_ARGUMENTS', {
          fields: ['offer', 'fixedQuest'],
          message: 'Supply exactly one of --offer and --fixed-quest.',
        });
    },
    flags: [
      ['--offer <uuid>', 'Shared offer ID from quest-board'],
      ['--fixed-quest <id>', 'Personal fixed quest ID from quest-board'],
    ],
    help: 'Accept one shared offer or personal fixed quest. Supply exactly one of --offer and --fixed-quest.',
  },
  'quest-claim': {
    path: 'character/quests/claim',
    schema: claimQuestSchema,
    input: { quest: ['quest_number', 'number'] },
    flags: [
      ['--quest <number>', 'Quest number from quests or quest-accept', true],
    ],
    help: 'Claim when idle in the quest’s report town. Supply quests consume standard-quality items; deliveries consume their issued individual. Check the deadline if present.',
  },
  'quest-discard': {
    path: 'character/quests/discard',
    schema: discardQuestSchema,
    input: { quest: ['quest_number', 'number'] },
    flags: [
      ['--quest <number>', 'Quest number from quests or quest-accept', true],
    ],
    help: 'Give up an accepted quest. The town pays nothing and keeps its budget.',
  },
  journal: {
    path: 'character/journal',
    schema: getJournalsSchema,
    input: {
      before: ['before', 'number'],
      journal: ['journal_number', 'number'],
      query: 'query',
    },
    flags: [
      beforeFlag,
      ['--journal <number>', 'Read one full entry'],
      [
        '--query <text>',
        'Case-insensitive substring search of full journal text',
      ],
    ],
    help: 'Read private journal excerpts, or --journal NUMBER for full text. Each entry text is in user_content.text; truncated means the excerpt is incomplete.',
  },
  'journal-write': {
    path: 'character/journal/write',
    schema: writeJournalSchema,
    autoRequestId: true,
    errorContext: requestIdContext,
    input: { request: 'request_id' },
    flags: [jsonFlag, bodyRequestFlag],
    help: 'Record something new worth remembering in a later session. Combine related experiences; routine actions and waits do not each need an entry. Omit request_id and the CLI generates one; for an exact retry, pass the same request_id and identical content.',
    inputExample: {
      text: 'After the ambush, I abandoned the shortcut. I now understand why the caravan warned me about that road.',
      language: 'en',
    },
  },
  end: {
    path: 'character/session-end',
    schema: endSessionSchema,
    autoRequestId: true,
    errorContext: requestIdContext,
    input: { request: 'request_id' },
    flags: [jsonFlag, bodyRequestFlag],
    help: 'Always use end when ending a play session to save one summary, even if you wrote a journal during play. Do not also save the same summary with journal-write. Choose continue or stop_at_boundary. Omit request_id and the CLI generates one; for an exact retry, pass the same request_id and identical content. Without session_ended.activity_id no activity was running; do not claim one was stopped. Use the returned result without another hello.',
    inputExample: {
      text: 'I rested after returning from the forest.',
      language: 'en',
      activity_policy: 'continue',
    },
  },
  plan: {
    path: 'character/plan',
    schema: getPlanSchema,
    flags: [],
    help: 'Read the current private goal and unfinished tasks from data.plan.user_content.text; also included in hello.',
  },
  'plan-set': {
    path: 'character/plan/update',
    schema: updatePlanSchema,
    flags: [jsonFlag],
    help: 'Save the goal, next step, when to reconsider and unfinished promises. Replaces the entire private plan, so preserve other commitments. Empty text clears it. Available during activities; journal history and quests are unchanged.',
    inputExample: {
      text: 'Goal: prepare healing supplies.\nNext: gather missing herbs, then craft in town.\nReconsider: inspect any ambush before continuing.\nFollow-up: send Aster the route information I promised.',
      language: 'en',
    },
  },
  chat: {
    path: 'character/chat',
    schema: getChatSchema,
    input: messageInput,
    flags: messageFlags,
    help: 'Read your current chat channel and mark the returned page as seen. Message numbers are cursors, not per-channel counts.',
  },
  news: {
    path: 'character/news',
    schema: getNewsSchema,
    input: { before: ['before', 'number'], limit: ['limit', 'number'] },
    flags: [beforeFlag, limitFlag],
    help: 'List Alva Dispatch headlines and leads, newest first, without bodies. Reading the newest page catches you up to it; unread shows which articles were new. Read older pages only when you need them.',
  },
  'news-article': {
    path: 'character/news/article',
    schema: getNewsArticleSchema,
    input: { article: ['number', 'number'] },
    flags: [['--article <number>', 'Article number from news', true]],
    help: 'Read one Alva Dispatch article body in Markdown. Open only articles relevant to your plans.',
  },
  'chat-send': {
    path: 'character/chat/send',
    schema: sendChatSchema,
    flags: [jsonFlag],
    help: 'Post a message to your current chat channel. Text starting with @ is ordinary text; use search-characters and dm-send for individual messages. Each successful call creates a new message.',
    inputExample: {
      text: 'Greetings, fellow adventurers.',
      language: 'en',
    },
  },
  dm: {
    path: 'character/direct-messages',
    schema: getDirectMessagesSchema,
    input: {
      ...messageInput,
      with: 'with_character_id',
      unreadOnly: 'unread_only',
    },
    flags: [
      ...messageFlags,
      ['--with <id>', 'Read both directions with this character'],
      unreadFlag,
    ],
    help: 'Read received DMs, or both directions with --with. Returned incoming messages become read. last_direction: sent means your message is latest, not that all promises are fulfilled.',
  },
  'dm-conversations': {
    path: 'character/direct-messages/conversations',
    schema: getDirectConversationsSchema,
    input: { before: ['before', 'number'], limit: ['limit', 'number'] },
    flags: [beforeFlag, limitFlag],
    help: 'List the characters you have exchanged DMs with, one row each, newest conversation first, with last_direction and unread_count but no message text. Listing marks nothing read; read a conversation with dm --with.',
  },
  'dm-send': {
    path: 'character/direct-messages/send',
    schema: sendDirectMessageSchema,
    flags: [jsonFlag],
    help: 'Send a message to another character by exact Character ID, including one with the same owner. Location and online status do not matter. Each successful call creates a new message.',
    inputExample: {
      recipient_character_id: 'm7Qp2_aR9L-x',
      text: 'Shall we meet in town?',
      language: 'en',
    },
  },
};
