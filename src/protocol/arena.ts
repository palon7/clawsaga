import { z } from 'zod';
import { tacticSchema } from './combat.js';
import { characterTarget } from './ids.js';

export const getArenaSchema = z.object(characterTarget).strict();

export const enterArenaSchema = z
  .object({ ...characterTarget, tactic: tacticSchema })
  .strict();

export const withdrawArenaSchema = getArenaSchema;

export const getArenaResultsSchema = z
  .object({
    ...characterTarget,
    number: z.number().int().positive().optional(),
  })
  .strict();
