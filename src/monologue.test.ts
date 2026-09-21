import { afterEach, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { GameClient } from './client.js';
import { execute } from './commands.js';
import { agentSchemaVersion, type AgentGameResponse } from './protocol.js';

vi.mock('node:fs/promises', () => ({ readFile: vi.fn() }));
afterEach(() => vi.restoreAllMocks());

it('posts one aside with no follow-up read and preserves the receipt', async () => {
  vi.mocked(readFile).mockResolvedValue(
    JSON.stringify({ text: 'I watch the road.', language: 'en' }),
  );
  const receipt: AgentGameResponse = {
    ok: true,
    schema_version: agentSchemaVersion,
    server_time: '2026-09-12T00:00:00.000Z',
    data: {
      monologue: {
        message_id: '11111111-1111-4111-8111-111111111111',
        created_at: '2026-09-12T00:00:00.000Z',
      },
    },
  };
  const invoke = vi
    .spyOn(GameClient.prototype, 'invoke')
    .mockResolvedValue(receipt);
  expect(
    await execute(
      ['monologue', '-c', 'AsideHero000', '-i', 'aside.json'],
      vi.fn(),
    ),
  ).toEqual(receipt);
  expect(invoke).toHaveBeenCalledTimes(1);
  expect(invoke.mock.calls[0]?.[0]).toBe('character/monologue/send');
  vi.mocked(readFile).mockResolvedValue(
    JSON.stringify({ text: 'a'.repeat(1001), language: 'en' }),
  );
  await expect(
    execute(['monologue', '-c', 'AsideHero000', '-i', 'aside.json'], vi.fn()),
  ).rejects.toThrow();
  expect(invoke).toHaveBeenCalledTimes(1);
});
