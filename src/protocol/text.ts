import { z } from 'zod';

// Reject NUL and lone surrogates before sending text to the game API.
export const unicodeTextSchema = z
  .string()
  .regex(/^[^\0\p{Cs}]*$/u, 'Use valid Unicode text without NUL characters.');
