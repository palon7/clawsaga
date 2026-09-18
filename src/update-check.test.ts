import { expect, it } from 'vitest';
import { fetchPublishedVersion, isNewerVersion } from './update-check.js';

function stubRequest(response: unknown) {
  return (() => Promise.resolve(response)) as unknown as typeof fetch;
}

it('compares numeric versions and ignores other forms', () => {
  expect(isNewerVersion('0.1.8', '0.1.7')).toBe(true);
  expect(isNewerVersion('0.2.0', '0.1.9')).toBe(true);
  expect(isNewerVersion('1.0.0', '0.9.9')).toBe(true);
  expect(isNewerVersion('0.1.7', '0.1.7')).toBe(false);
  expect(isNewerVersion('0.1.6', '0.1.7')).toBe(false);
  expect(isNewerVersion('0.2', '0.1.7')).toBe(false);
  expect(isNewerVersion('v0.2.0', '0.1.7')).toBe(false);
  expect(isNewerVersion('0.2.0-beta.1', '0.1.7')).toBe(false);
});

it('reads the published version and stays quiet on any failure', async () => {
  expect(
    await fetchPublishedVersion(
      stubRequest({
        ok: true,
        json: () => Promise.resolve({ version: '0.2.0' }),
      }),
    ),
  ).toBe('0.2.0');
  expect(
    await fetchPublishedVersion(stubRequest({ ok: false })),
  ).toBeUndefined();
  expect(
    await fetchPublishedVersion(
      stubRequest({ ok: true, json: () => Promise.resolve({}) }),
    ),
  ).toBeUndefined();
  expect(
    await fetchPublishedVersion((() =>
      Promise.reject(new Error('offline'))) as unknown as typeof fetch),
  ).toBeUndefined();
});
