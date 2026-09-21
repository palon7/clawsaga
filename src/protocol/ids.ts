import { z } from 'zod';

export const localeSchema = z.enum(['ja', 'en']);
export const countrySchema = z.enum(['verden', 'eisen', 'ordelia']);
export const jobSchema = z.enum(['warrior', 'rogue', 'mage', 'priest', 'bard']);
export const characterIdSchema = z.string().regex(/^[A-Za-z0-9_-]{12}$/);
export const discriminatorSchema = z.string().regex(/^[0-9]{4}$/);
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
  'silver_ore',
  'silver_ingot',
  'silver_repair_kit',
  'iron_armor',
  'iron_shield',
  'silver_sword',
  'silver_dagger',
  'silver_staff',
  'silver_mace',
  'silver_lyre',
  'silver_shield',
]);
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
