import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, it } from 'vitest';
import { readCliEvents } from './test-event-log.js';
import metadata from '../package.json' with { type: 'json' };

const cli = fileURLToPath(new URL('../bin/clawsaga.mjs', import.meta.url));
const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function directory() {
  const path = mkdtempSync(join(tmpdir(), 'clawsaga-events-'));
  directories.push(path);

  return path;
}

function launch(command: string, args: string[], log?: string) {
  const env = { ...process.env };
  delete env.CLAWSAGA_EVENT_LOG;
  if (log !== undefined) env.CLAWSAGA_EVENT_LOG = log;

  const child = spawn(command, args, { env });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8').on('data', (text: string) => {
    stdout += text;
  });
  child.stderr.setEncoding('utf8').on('data', (text: string) => {
    stderr += text;
  });

  return new Promise<{ stdout: string; stderr: string; code: number | null }>(
    (resolve, reject) => {
      child.on('error', reject);
      child.on('close', (code) => resolve({ stdout, stderr, code }));
    },
  );
}

function run(args: string[], log?: string) {
  return launch(process.execPath, [cli, ...args], log);
}

it.each(['--version', '--unknown-option'])(
  'keeps the command unchanged when logging fails (%s)',
  async (arg) => {
    const ordinary = await run([arg]);
    const failedLog = await run([arg], directory());
    expect(failedLog.stdout).toBe(ordinary.stdout);
    expect(failedLog.code).toBe(ordinary.code);
    expect(JSON.parse(failedLog.stderr)).toMatchObject({
      event: 'event_log_error',
    });
  },
);

it('records every invocation from shell loops, pipes and parallel processes', async () => {
  const file = join(directory(), 'events.jsonl');
  const loop =
    'for item in first second third; do "$1" "$2" --version; done | cat';

  const results = await Promise.all([
    launch('/bin/sh', ['-c', loop, 'event-test', process.execPath, cli], file),
    ...Array.from({ length: 6 }, () => run(['--version'], file)),
  ]);

  expect(results.every((result) => result.code === 0)).toBe(true);
  const records = readCliEvents(file);
  const invocations = new Set(records.map((record) => record.invocation_id));
  expect(invocations.size).toBe(9);
  for (const id of invocations) {
    expect(
      records
        .filter((record) => record.invocation_id === id)
        .map((record) => record.type),
    ).toEqual(['start', 'result', 'finish']);
  }
});

it('writes correlated start, result and finish records without changing CLI output', async () => {
  const file = join(directory(), 'events.jsonl');
  const ordinary = await run(['--version']);
  const logged = await run(['--version'], file);
  expect(logged).toEqual(ordinary);
  expect(existsSync(file)).toBe(true);

  const records = readCliEvents(file);
  expect(records.map((record) => record.type)).toEqual([
    'start',
    'result',
    'finish',
  ]);
  expect(new Set(records.map((record) => record.invocation_id)).size).toBe(1);
  for (const record of records) {
    expect(record.version).toBe(1);
    expect(Number.isFinite(Date.parse(record.timestamp))).toBe(true);
  }

  expect(records[0]).toMatchObject({
    argv: ['--version'],
    cli_version: metadata.version,
  });
  expect(records[1]).toMatchObject({ data: JSON.parse(logged.stdout) });
  expect(records[2]).toMatchObject({ exit_code: 0 });
});
