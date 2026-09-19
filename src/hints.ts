import type {
  AgentGameResponse,
  AgentHint,
  AgentLastResult,
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
    `Run \`equip --equipment ${args.equipment_id}${character ? ` -c ${character}` : ''}\`.`,
};

function renderHint(hint: AgentHint, character?: string): string {
  if ('note' in hint) return hint.note;
  const render = command[hint.operation];
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

function ambushOf(lastResult: AgentLastResult | undefined) {
  return lastResult && 'ambush' in lastResult ? lastResult.ambush : undefined;
}

function repetitionOf(
  response: AgentGameResponse,
): RepetitionSummary | undefined {
  return (response as { repetition?: RepetitionSummary }).repetition;
}

// CLI-only notes: the local wait choice, the repetition summary, and how a
// confirmed result or ambush relates to the current activity. The server keeps
// deciding the ordinary operation hints.
function stateNotes(
  response: AgentGameResponse,
  character: string | undefined,
  wait: boolean,
) {
  const notes: string[] = [];
  const lastResult = response.data.last_result;
  const activity: AgentRunningActivity | undefined =
    response.data.activity ?? undefined;
  let supersededActivityId: string | undefined;
  const ambush = ambushOf(lastResult);
  if (lastResult && ambush) {
    // The server always suggests reading the ambush combat. Phrase the read
    // here instead, so it only appears when that combat is not already the
    // response's current activity.
    supersededActivityId = ambush.activity_id;
    if (
      activity?.kind === 'combat' &&
      activity.activity_id === ambush.activity_id
    ) {
      // The response already shows this combat, so do not tell the agent to
      // read it again.
      notes.push(
        `The ${lastResult.kind} result is confirmed and combat ${ambush.activity_id} is the current activity; continue or stop that battle instead of repeating the finished activity.`,
      );
    } else {
      notes.push(
        `An ambush happened after the confirmed ${lastResult.kind} result, which stands; that combat is not the current activity. Read its outcome with \`${activityCommand(ambush.activity_id, character)}\` if you have not seen it.`,
      );
      if (activity)
        notes.push(
          `A different ${activity.kind} activity (${activity.activity_id}) is running now.`,
        );
    }
  }
  const repetition = repetitionOf(response);
  if (repetition && repetition.completed_count < repetition.requested_count) {
    // A failed read leaves the attempt that was in progress unconfirmed, so the
    // confirmed count must not read as if the stopped attempt produced nothing.
    const unconfirmed =
      repetition.stopped_reason === 'activity_failed'
        ? ' The attempt that was in progress is not confirmed and may have produced output; check the current or latest activity before another change.'
        : '';
    notes.push(
      `${repetition.completed_count} of ${repetition.requested_count} attempts are confirmed and their output is kept; the repetition stopped before the rest.${unconfirmed}`,
    );
  } else if (!wait && response.ok) {
    if (lastResult)
      notes.push(
        `This is the stored result of an earlier accepted ${lastResult.kind} activity, not a new start.`,
      );
    else if (activity)
      notes.push(
        `The ${activity.kind} activity ${activity.activity_id} was accepted and has not finished; track it with \`${activityCommand(activity.activity_id, character)}\`.`,
      );
  }
  return { notes, supersededActivityId };
}

function supersededAmbushHint(hint: AgentHint, activityId: string) {
  return (
    'operation' in hint &&
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
};

// A thrown error never reaches withRenderedHints, so the CLI carries this
// short step in the failure envelope instead.
export function recoveryHint(
  detail: Record<string, unknown>,
  context: RecoveryContext,
): string | undefined {
  const repetition = detail.repetition as RepetitionSummary | undefined;
  if (detail.outcome !== 'unknown' && repetition?.stopped_reason !== 'unknown')
    return undefined;
  const activityId =
    typeof detail.activity_id === 'string' ? detail.activity_id : undefined;
  const requestId =
    typeof detail.request_id === 'string' ? detail.request_id : undefined;
  const parts = [
    'The outcome is unknown; do not start a different change before checking.',
  ];
  if (context.activity)
    parts.push('It may have produced output that is not yet confirmed.');
  if (activityId) {
    parts.push(
      `Read the activity with \`${activityCommand(activityId, context.character)}\`.`,
    );
  } else if (context.activity && !requestId) {
    // Without an ID, only the current or latest activity can identify what the
    // lost response accepted. A request ID reconciles the same request instead.
    const current = `activity${context.character ? ` -c ${context.character}` : ''}`;
    parts.push(
      `Read the current or latest activity with \`${current}\`, match its kind and time against what you sent, and do not resend the change if the match is ambiguous.`,
    );
  }
  if (requestId)
    parts.push(
      context.craft
        ? `To reconcile the same craft, resend only that lot with the same recipe, fee limit and \`--request ${requestId}\`; the same ID returns the accepted craft or its result instead of starting a new one. Do not start another lot or resend the remaining count.`
        : `To reconcile the same request, repeat it with the same arguments and \`--request ${requestId}\`; the same ID returns the accepted result instead of starting a new one.`,
    );
  return parts.join(' ');
}
