import { expect, it } from 'vitest';
import { CliError, cliErrorMessage, cliFailure } from './errors.js';

it('emits a message-first public failure without the internal code', () => {
  const failure = cliFailure(
    new CliError('RATE_LIMITED', {
      retry_after: '3',
      message: 'Too many requests.',
    }),
  );
  expect(failure).toEqual({
    ok: false,
    error: { message: 'Too many requests.', retry_after: '3' },
  });
  expect(JSON.stringify(failure)).not.toContain('RATE_LIMITED');
});

it('uses the default message and no detail for an unknown error', () => {
  const failure = cliFailure(new Error('private stack'));
  expect(failure).toEqual({
    ok: false,
    error: { message: cliErrorMessage('CLIENT_ERROR') },
  });
  expect(JSON.stringify(failure)).not.toContain('private stack');
});
