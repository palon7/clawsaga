import { vi } from 'vitest';
import { GameClient } from './client.js';
import { agentSchemaVersion, type AgentGameResponse } from './protocol.js';

/** Answers every game request with `response`. */
export function stubInvoke(response: AgentGameResponse) {
  return vi.spyOn(GameClient.prototype, 'invoke').mockResolvedValue(response);
}

export const initial: AgentGameResponse = {
  ok: true,
  schema_version: agentSchemaVersion,
  server_time: '2026-09-09T00:00:00.000Z',
  next_poll_after_seconds: 5,
  data: {
    activity: {
      kind: 'travel',
      activity_id: 1,
      from: { id: 'dolgan', name: 'Dolgan', kind: 'town' },
      to: { id: 'openpit', name: 'Open pit', kind: 'field' },
      started_at: '2026-09-09T00:00:00.000Z',
      arrives_at: '2026-09-09T00:00:15.000Z',
      duration_seconds: 15,
      status: 'RUNNING',
    },
  },
};
