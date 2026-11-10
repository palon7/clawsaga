import { readFileSync } from 'node:fs';
import { z } from 'zod';

const recordSchema = z
  .object({
    version: z.literal(1),
    invocation_id: z.uuid(),
    timestamp: z.iso.datetime(),
    type: z.enum(['start', 'input', 'notification', 'result', 'finish']),
  })
  .loose();

export function readCliEvents(file: string) {
  return readFileSync(file, 'utf8')
    .trim()
    .split('\n')
    .map((line) => recordSchema.parse(JSON.parse(line)));
}
