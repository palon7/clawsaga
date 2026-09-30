import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import type { AgentGameResponse, AgentRunningActivity } from './protocol.js';
import type { GameClient } from './client.js';
import { CliError } from './errors.js';
import type { RepetitionSummary } from './hints.js';

// invoke marks a failure that happened before the game request was sent, so the
// start cannot have taken effect.
export function notSent(error: CliError) {
  return error.detail.outcome === 'not_sent';
}

// 受付診断。ホストがCLIを終了させても、この行から活動を再開せず回収できる。
function acceptedActivityNote(
  activity: AgentRunningActivity,
  nextPollAfterSeconds: number | undefined,
  requestId?: string,
) {
  return {
    event: 'activity_accepted',
    activity_id: activity.activity_id,
    kind: activity.kind,
    started_at: activity.started_at,
    // 出力のJSONでは値のない項目が落ちる。
    completes_at: activity.completes_at,
    arrives_at: activity.arrives_at,
    time_limit_at: activity.time_limit_at,
    next_poll_after_seconds: nextPollAfterSeconds,
    request_id: requestId,
  };
}

export async function repeatActivity(
  client: GameClient,
  path: string,
  input: Record<string, unknown>,
  values: { character: string | undefined; locale?: 'ja' | 'en' | undefined },
  count: number,
  options?: {
    requestIdPerLot?: boolean;
    notify?: (value: unknown) => void;
  },
) {
  let confirmed = 0;
  let lastRequestId: string | undefined;
  const produced: Record<string, number> = {};
  const summary = (stoppedReason: string): RepetitionSummary => ({
    requested_count: count,
    completed_count: confirmed,
    produced: { ...produced },
    stopped_reason: stoppedReason,
  });
  const incomplete = (response: AgentGameResponse, stoppedReason: string) => ({
    ...response,
    ok: false as const,
    error: {
      message: 'The repetition ended before all requested attempts completed.',
      ...(lastRequestId === undefined ? {} : { request_id: lastRequestId }),
    },
    repetition: summary(stoppedReason),
  });
  // Returns the command's final response, or undefined to go on to the next lot.
  const attempt = async (
    lotInput: Record<string, unknown>,
    requestId: string | undefined,
  ) => {
    const started = await client.invoke(path, lotInput);
    if (!started.ok)
      return { ...started, repetition: summary('start_rejected') };
    // A replayed request whose accepted activity already ended answers with
    // its stored result, even while a newer activity is running.
    const completed = started.data.last_result
      ? started
      : await waitForActivity(
          client,
          values,
          started,
          options?.notify,
          requestId,
        );
    if (!completed.ok)
      return { ...completed, repetition: summary('activity_failed') };
    const result = endedProduction(completed);
    if (result.end_reason !== 'COMPLETED')
      return incomplete(completed, 'activity_stopped');
    const output = result.output;
    if (!output)
      throw new CliError('INVALID_RESPONSE', {
        reason: 'unexpected_production_result',
      });
    confirmed += 1;
    produced[output.item_id] =
      (produced[output.item_id] ?? 0) + output.quantity;
    if (result.kind === 'gather' && result.ambush)
      return confirmed === count
        ? { ...completed, repetition: summary('ambush') }
        : incomplete(completed, 'ambush');
    if (confirmed === count)
      return { ...completed, repetition: summary('count_reached') };
    return undefined;
  };
  while (confirmed < count) {
    // Craft lots are separate requests. The input carries the first lot's ID
    // (from --request or generated); later lots get a new one.
    const firstRequestId =
      typeof input.request_id === 'string' ? input.request_id : undefined;
    const requestId =
      options?.requestIdPerLot && confirmed > 0 ? randomUUID() : firstRequestId;
    lastRequestId = requestId;
    const lotInput =
      requestId === undefined ? input : { ...input, request_id: requestId };
    try {
      const final = await attempt(lotInput, requestId);
      if (final) return final;
    } catch (error) {
      if (error instanceof CliError)
        throw new CliError(error.code, {
          ...error.detail,
          ...(requestId === undefined ? {} : { request_id: requestId }),
          // 送信前の失敗は開始していないため、成果があった可能性を主張しない。
          repetition: summary(notSent(error) ? 'start_rejected' : 'unknown'),
        });
      throw error;
    }
  }
  throw new CliError('INVALID_ARGUMENTS', { fields: ['count'] });
}

function endedProduction(response: AgentGameResponse) {
  const result = response.data.last_result;
  if (
    !result ||
    (result.kind !== 'gather' && result.kind !== 'craft') ||
    result.status !== 'ENDED'
  )
    throw new CliError('INVALID_RESPONSE', {
      reason: 'unexpected_production_result',
    });
  return result;
}

export async function waitForActivity(
  client: GameClient,
  values: { character: string | undefined; locale?: 'ja' | 'en' | undefined },
  initial: AgentGameResponse,
  notify?: (value: unknown) => void,
  requestId?: string,
) {
  let result = initial;
  const activity = result.ok ? result.data.activity : undefined;
  if (!activity)
    throw new CliError('INVALID_RESPONSE', { reason: 'missing_activity_id' });
  const activityId = activity.activity_id;
  notify?.(
    acceptedActivityNote(activity, result.next_poll_after_seconds, requestId),
  );
  while (result.data.activity?.activity_id === activityId) {
    const seconds = result.next_poll_after_seconds;
    if (!seconds)
      throw new CliError('INVALID_RESPONSE', {
        reason: 'missing_poll_interval',
        activity_id: activityId,
      });
    await sleep(seconds * 1000);
    try {
      result = await client.invoke('character/activity', {
        character_id: values.character,
        activity_id: activityId,
        ...(values.locale ? { locale: values.locale } : {}),
      });
    } catch (error) {
      if (error instanceof CliError)
        throw new CliError(error.code, {
          ...error.detail,
          activity_id: activityId,
          outcome: 'unknown',
        });
      throw error;
    }
    if (!result.ok) return result;
  }
  const lastResult = result.data.last_result;
  if (!lastResult || lastResult.activity_id !== activityId)
    throw new CliError('INVALID_RESPONSE', {
      reason: 'activity_id_mismatch',
      activity_id: activityId,
    });
  return result;
}
