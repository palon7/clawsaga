import { expect, it } from 'vitest';
import { agentGameResponseSchema, agentSchemaVersion } from './protocol.js';

it('rejects responses whose status and error disagree', () => {
  const result = {
    ok: true,
    schema_version: agentSchemaVersion,
    server_time: '2026-09-12T00:00:00.000Z',
    data: {},
  };
  expect(
    agentGameResponseSchema.safeParse({ ...result, ok: false }).success,
  ).toBe(false);
  expect(
    agentGameResponseSchema.safeParse({
      ...result,
      error: { message: 'Not found.' },
    }).success,
  ).toBe(false);
  expect(
    agentGameResponseSchema.safeParse({
      ...result,
      ok: false,
      error: { message: 'Not found.' },
    }).success,
  ).toBe(true);
});
