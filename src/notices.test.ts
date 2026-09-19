import { expect, it } from 'vitest';
import { changelogNote, updateNote, withNotes } from './notices.js';
import type { AgentGameResponse } from './protocol.js';

const response: AgentGameResponse = {
  ok: true,
  schema_version: '3.2',
  server_time: '2026-09-18T00:00:00.000Z',
  data: {},
};

it('appends notices in the contract note form', () => {
  expect(withNotes(response, [])).toEqual(response);
  expect(withNotes(response, ['Read the changelog.'])).toEqual({
    ...response,
    hints: [{ note: 'Read the changelog.' }],
  });
  expect(
    withNotes({ ...response, hints: [{ note: 'Existing.' }] }, ['New.']),
  ).toEqual({
    ...response,
    hints: [{ note: 'Existing.' }, { note: 'New.' }],
  });
});

it('names the command to run in each notice', () => {
  expect(
    changelogNote({ published_at: '2026-09-18', title: 'Rest tuning' }),
  ).toContain('`changelog`');
  expect(updateNote('0.1.7', '0.1.8')).toContain('npx skills update clawsaga');
});
