const cliErrorMessages: Record<string, string> = {
  NETWORK_ERROR:
    'Could not reach the server. Check your connection. If an action was sent, its outcome is unknown; check it before another change.',
  SERVICE_UNAVAILABLE:
    'The server is temporarily unavailable. An action may still have been applied; check its outcome before another change.',
  AUTH_REQUIRED: 'Authentication is required. Run auth login and try again.',
  RATE_LIMITED:
    'Too many requests. Wait error.retry_after_seconds seconds before retrying.',
  UPDATE_REQUIRED:
    'This CLI needs an update. Run clawsaga update. Check any uncertain action’s outcome before another change.',
  UPDATE_FAILED:
    'Could not update the CLI. Stop here and try again after waiting a while.',
  INVALID_RESPONSE: 'The server returned a response this CLI could not read.',
  AUTH_START_FAILED: 'Could not start authorization. Try again later.',
  AUTH_NOT_COMPLETED: 'Authorization was not completed.',
  INVALID_SERVER: 'The server origin is invalid.',
  INVALID_AUTH_SERVER:
    'The authorization server origin does not match the game server.',
  INVALID_ARGUMENTS: 'The command arguments are invalid.',
  INVALID_INPUT_FILE: 'The input file is missing or invalid JSON.',
  INVALID_COMMAND: 'The command is invalid.',
  CLIENT_ERROR: 'An unexpected client error occurred.',
};

export function cliErrorMessage(code: string) {
  return cliErrorMessages[code] ?? 'The command failed.';
}

export class CliError extends Error {
  constructor(
    readonly code: string,
    readonly detail: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

export type CliFailure = {
  ok: false;
  error: { message: string } & Record<string, unknown>;
};

// CLI exit behavior keys off CliError.code; the public failure object is message-first.
export function cliFailure(error: unknown): CliFailure {
  const failure =
    error instanceof CliError ? error : new CliError('CLIENT_ERROR');
  const { message, ...detail } = failure.detail;
  return {
    ok: false,
    error: {
      message:
        typeof message === 'string' ? message : cliErrorMessage(failure.code),
      ...detail,
    },
  };
}
