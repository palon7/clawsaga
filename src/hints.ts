import type {
  AgentGameResponse,
  AgentHint,
  AgentRunningActivity,
} from './protocol.js';

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
    `Run \`equip --instance ${args.instance_id}${character ? ` -c ${character}` : ''}\`.`,
};

function renderHint(hint: AgentHint, character?: string): string {
  if (hint.note !== undefined) return hint.note;
  const render =
    hint.operation === undefined ? undefined : command[hint.operation];
  if (!render || !hint.arguments) return `Use the ${hint.operation} operation.`;
  return render(hint.arguments, character);
}

// The repetition summary the CLI adds to its own result. It is not part of the
// server protocol.
export type RepetitionSummary = {
  requested_count: number;
  completed_count: number;
  produced: Record<string, number>;
  stopped_reason: string;
};

function activityCommand(activityId: string, character?: string) {
  return `activity -a ${activityId}${character ? ` -c ${character}` : ''}`;
}

function repetitionOf(
  response: AgentGameResponse,
): RepetitionSummary | undefined {
  return (response as { repetition?: RepetitionSummary }).repetition;
}

function ambushNotes(
  response: AgentGameResponse,
  character: string | undefined,
): { notes: string[]; supersededActivityId?: string } {
  const notes: string[] = [];
  const lastResult = response.data.last_result;
  const activity: AgentRunningActivity | undefined =
    response.data.activity ?? undefined;
  const ambush = lastResult?.ambush;
  if (!lastResult || !ambush) return { notes };
  // The server always suggests reading the ambush combat. Phrase the read
  // here instead, so it only appears when that combat is not already the
  // response's current activity.
  if (
    activity?.kind === 'combat' &&
    activity.activity_id === ambush.activity_id
  ) {
    // The response already shows this combat, so do not tell the agent to
    // read it again.
    notes.push(
      `The ${lastResult.kind} activity is complete. Continue the ambush battle or retreat.`,
    );
  } else {
    notes.push(
      `The ${lastResult.kind} activity is complete. Read the ambush battle report with \`${activityCommand(ambush.activity_id, character)}\` if you have not seen it.`,
    );
    if (activity)
      notes.push(
        `Your ${activity.kind} activity (${activity.activity_id}) is now in progress.`,
      );
  }
  return { notes, supersededActivityId: ambush.activity_id };
}

// CLI-only notes: the local wait choice, the repetition summary, and how a
// confirmed result or ambush relates to the current activity. The server keeps
// deciding the ordinary operation hints.
function stateNotes(
  response: AgentGameResponse,
  character: string | undefined,
  wait: boolean,
) {
  const { notes, supersededActivityId } = ambushNotes(response, character);
  const lastResult = response.data.last_result;
  const activity: AgentRunningActivity | undefined =
    response.data.activity ?? undefined;
  const repetition = repetitionOf(response);
  if (repetition && repetition.completed_count < repetition.requested_count) {
    // A failed read leaves the attempt that was in progress unconfirmed, so the
    // confirmed count must not read as if the stopped attempt produced nothing.
    const unconfirmed =
      repetition.stopped_reason === 'activity_failed'
        ? ' The last attempt may also have succeeded. Check your current or latest activity before continuing.'
        : '';
    notes.push(
      `Stopped with ${repetition.completed_count} of ${repetition.requested_count} attempts completed. You keep their results.${unconfirmed}`,
    );
  } else if (!wait && response.ok) {
    if (lastResult)
      notes.push(
        `This ${lastResult.kind} activity has already finished. No new activity was started.`,
      );
    else if (activity)
      notes.push(
        `Your ${activity.kind} activity is in progress. Check it with \`${activityCommand(activity.activity_id, character)}\`.`,
      );
  }
  return { notes, supersededActivityId };
}

function supersededAmbushHint(hint: AgentHint, activityId: string) {
  return (
    hint.operation === 'get_activity' &&
    hint.arguments?.activity_id === activityId
  );
}

export function withRenderedHints(
  response: AgentGameResponse,
  character?: string,
  options: { wait?: boolean } = {},
): AgentGameResponse {
  const { hints, ...rest } = response;
  const { notes, supersededActivityId } = stateNotes(
    response,
    character,
    options.wait !== false,
  );
  const rendered = (hints ?? [])
    .filter(
      (hint) =>
        supersededActivityId === undefined ||
        !supersededAmbushHint(hint, supersededActivityId),
    )
    .map((hint) => ({ note: renderHint(hint, character) }));
  if (rendered.length === 0 && notes.length === 0) return rest;
  return {
    ...rest,
    hints: [...rendered, ...notes.map((note) => ({ note }))],
  };
}

export type RecoveryContext = {
  character?: string | undefined;
  // The invoked command starts a main activity (travel, gather, craft, fight, rest).
  activity: boolean;
  // The invoked command starts a craft.
  craft: boolean;
  // The invoked command uses or discards items. It has no request ID.
  itemChange: boolean;
};

function itemChangeRecovery(character: string | undefined) {
  const read = `character${character ? ` -c ${character}` : ''} --include inventory`;
  return [
    'The result is unclear. The item may already have been used or discarded; do not repeat the command.',
    `Check your HP, MP and inventory with \`${read}\`.`,
    'Even if nothing has changed, repeating the command could spend more items. Until you know what happened, stop using or discarding items and report the unclear result.',
  ].join(' ');
}

// A thrown error never reaches withRenderedHints, so the CLI carries this
// short step in the failure envelope instead.
export function recoveryHint(
  detail: Record<string, unknown>,
  context: RecoveryContext,
): string | undefined {
  const repetition = detail.repetition as RepetitionSummary | undefined;
  if (detail.outcome !== 'unknown' && repetition?.stopped_reason !== 'unknown')
    return undefined;
  if (context.itemChange) return itemChangeRecovery(context.character);
  const activityId =
    typeof detail.activity_id === 'string' ? detail.activity_id : undefined;
  const requestId =
    typeof detail.request_id === 'string' ? detail.request_id : undefined;
  const parts = [
    'The result is unclear. Check what happened before taking another action.',
  ];
  if (context.activity) parts.push('Your activity may already have succeeded.');
  if (activityId) {
    parts.push(
      `Check your activity with \`${activityCommand(activityId, context.character)}\`.`,
    );
  } else if (context.activity && !requestId) {
    // Without an ID, only the current or latest activity can identify what the
    // lost response accepted. A request ID reconciles the same request instead.
    const current = `activity${context.character ? ` -c ${context.character}` : ''}`;
    parts.push(
      `Check your current or latest activity with \`${current}\`. Compare its kind and time with your command. If you cannot tell whether it is the same activity, do not repeat the command.`,
    );
  }
  if (requestId)
    parts.push(
      context.craft
        ? `Retry only that craft with the same recipe, fee limit and \`--request ${requestId}\` to check what happened. This will not start a second craft. Do not start another lot or repeat the remaining count.`
        : `Retry the same command with the same arguments and \`--request ${requestId}\` to check what happened. This will not repeat the action.`,
    );
  return parts.join(' ');
}
