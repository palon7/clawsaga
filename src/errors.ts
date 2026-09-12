export class CliError extends Error {
  constructor(
    readonly code: string,
    readonly detail: Record<string, unknown> = {},
  ) {
    super(code);
  }
}
