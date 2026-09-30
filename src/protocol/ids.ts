import { z } from 'zod';

export const localeSchema = z.enum(['ja', 'en']);
export const jobSchema = z.enum(['warrior', 'rogue', 'mage', 'priest', 'bard']);
export const characterIdSchema = z.string().regex(/^[A-Za-z0-9_-]{12}$/);
export const discriminatorSchema = z.string().regex(/^[0-9]{4}$/);
export const uuidSchema = z.uuid();
export const itemIdSchema = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/);

export const skillIdSchema = z.enum([
  'mining',
  'gathering',
  'smithing',
  'crafting',
  'alchemy',
  'cooking',
  'enchanting',
]);
