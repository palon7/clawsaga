import type { AgentGameResponse, AgentHint } from './protocol.js';

// The server decides which suggestion a result earns; the CLI renders it with
// its own command names and flags. Rendered text keeps the contract's note
// form so the printed response still validates against the shared schema.
const command: Record<
  string,
  (args: Record<string, string>, character?: string) => string
> = {
  hello: (args) => `Run \`hello -c ${args.character_id}\`.`,
  get_activity: (args, character) =>
    `Run \`activity -a ${args.activity_id}${character ? ` -c ${character}` : ''}\`.`,
  equip_item: (args, character) =>
    `Run \`equip --equipment ${args.equipment_id}${character ? ` -c ${character}` : ''}\`.`,
};

function renderHint(hint: AgentHint, character?: string): string {
  if ('note' in hint) return hint.note;
  const render = command[hint.operation];
  if (!render || !hint.arguments) return `Use the ${hint.operation} operation.`;
  return render(hint.arguments, character);
}

export function withRenderedHints(
  response: AgentGameResponse,
  character?: string,
): AgentGameResponse {
  const { hints, ...rest } = response;
  return hints?.length
    ? {
        ...rest,
        hints: hints.map((hint) => ({ note: renderHint(hint, character) })),
      }
    : rest;
}
