import { appendFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import metadata from '../package.json' with { type: 'json' };

type Event =
  | { type: 'start'; argv: string[]; cli_version: string }
  | { type: 'input'; command: string; data: unknown }
  | { type: 'notification' | 'result'; data: unknown }
  | { type: 'finish'; exit_code: number };

export function createEventLog(
  argv: string[],
  file = process.env.CLAWSAGA_EVENT_LOG,
): (event: Event) => void {
  if (!file) return () => undefined;

  const invocation = randomUUID();
  let warned = false;
  const write = (event: Event) => {
    try {
      const record = {
        version: 1,
        invocation_id: invocation,
        timestamp: new Date().toISOString(),
        ...event,
      };

      appendFileSync(file, `${JSON.stringify(record)}\n`, { mode: 0o600 });
    } catch {
      if (!warned) {
        process.stderr.write(
          `${JSON.stringify({ event: 'event_log_error', message: 'Could not write the CLI event log; command execution continues.' })}\n`,
        );
        warned = true;
      }
    }
  };

  write({ type: 'start', argv, cli_version: metadata.version });

  return write;
}
