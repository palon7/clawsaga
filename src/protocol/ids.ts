import { z } from 'zod';

export const localeSchema = z.enum(['ja', 'en']);
export const countrySchema = z.enum(['verden', 'eisen', 'ordelia']);
export const jobSchema = z.enum(['warrior', 'rogue', 'mage', 'priest', 'bard']);
export const publicIdSchema = z.string().regex(/^[A-Za-z]{3,20}$/);
export const uuidSchema = z.uuid();
export const timestampSchema = z.iso.datetime();
export const itemIdSchema = z.enum([
  'issued_sword',
  'issued_dagger',
  'issued_staff',
  'issued_mace',
  'issued_lyre',
  'issued_clothing',
  'iron_sword',
  'iron_dagger',
  'oak_staff',
  'iron_mace',
  'wooden_lyre',
  'healing_potion',
  'herb',
  'food',
  'wolf_meat',
  'ore',
  'fuel',
  'metal_ingot',
  'travel_ration',
  'wolf_jerky',
  'metal_repair_kit',
  'basic_pickaxe',
]);
export type ItemId = z.infer<typeof itemIdSchema>;
export type JobId = z.infer<typeof jobSchema>;

export const skillIdSchema = z.enum([
  'mining',
  'gathering',
  'smithing',
  'crafting',
  'alchemy',
  'cooking',
  'enchanting',
]);
