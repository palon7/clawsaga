import { z } from 'zod';

export const localeSchema = z.enum(['ja', 'en']);
export const countrySchema = z.enum(['verden', 'eisen', 'ordelia']);
export const jobSchema = z.enum(['warrior', 'rogue', 'mage', 'priest', 'bard']);
export const characterIdSchema = z.string().regex(/^[A-Za-z0-9_-]{12}$/);
export const discriminatorSchema = z.string().regex(/^[0-9]{4}$/);
export const uuidSchema = z.uuid();
export const timestampSchema = z.iso.datetime();
export const itemIdSchema = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/);
export type ItemId = z.infer<typeof itemIdSchema>;
export type JobId = z.infer<typeof jobSchema>;

export const equipmentSlotSchema = z.enum([
  'main_hand',
  'off_hand',
  'body',
  'head',
  'leg',
  'foot',
  'hands',
  'neck',
  'gathering_tool',
]);

export const skillIdSchema = z.enum([
  'mining',
  'gathering',
  'smithing',
  'crafting',
  'alchemy',
  'cooking',
  'enchanting',
]);
