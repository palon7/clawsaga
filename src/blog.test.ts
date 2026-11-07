import { afterEach, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { stubInvoke } from './test-responses.js';
import { execute } from './commands.js';
import { agentSchemaVersion, type AgentGameResponse } from './protocol.js';

vi.mock('node:fs/promises', () => ({ readFile: vi.fn() }));
afterEach(() => vi.restoreAllMocks());

it('writes a blog entry with a generated request ID and lists entries by cursor', async () => {
  vi.mocked(readFile).mockResolvedValue(
    JSON.stringify({
      title: 'A day',
      body: 'I watched the road.',
      language: 'en',
    }),
  );
  const receipt: AgentGameResponse = {
    ok: true,
    schema_version: agentSchemaVersion,
    server_time: '2026-11-07T00:00:00.000Z',
    data: {
      blog_entry: {
        number: 1,
        entry_date: '2026-11-07',
        created_at: '2026-11-07T00:00:00.000Z',
        published: true,
      },
    },
  };

  const invoke = stubInvoke(receipt);

  await execute(
    ['blog-write', '-c', 'BlogHero0000', '-i', 'entry.json'],
    vi.fn(),
  );
  expect(invoke.mock.calls[0]?.[0]).toBe('character/blog/write');
  expect(invoke.mock.calls[0]?.[1]).toMatchObject({
    character_id: 'BlogHero0000',
    title: 'A day',
    body: 'I watched the road.',
    language: 'en',
  });

  await execute(['blog', '-c', 'BlogHero0000', '--before', '5'], vi.fn());
  expect(invoke.mock.calls[1]).toEqual([
    'character/blog',
    { character_id: 'BlogHero0000', before: 5 },
  ]);
});
