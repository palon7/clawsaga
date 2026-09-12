import { expect, it } from 'vitest';
import { agentGameResponseSchema } from './protocol.js';
import { combatReportSchema, useItemSchema } from './protocol/combat.js';
import { itemIdSchema } from './protocol/ids.js';
import { recipeViewSchema, resourceViewSchema } from './protocol/production.js';
import { travelActivityViewSchema } from './protocol/movement.js';

it('rejects responses whose status and error disagree', () => {
  const result = {
    ok: true,
    schema_version: '2.0',
    server_time: '2026-09-12T00:00:00.000Z',
    locale: 'en',
    data: {},
    user_content: [],
  };
  expect(
    agentGameResponseSchema.safeParse({ ...result, ok: false }).success,
  ).toBe(false);
  expect(
    agentGameResponseSchema.safeParse({
      ...result,
      error: { code: 'NOT_FOUND' },
    }).success,
  ).toBe(false);
  expect(
    agentGameResponseSchema.safeParse({
      ...result,
      ok: false,
      error: { code: 'NOT_FOUND' },
    }).success,
  ).toBe(true);
});

it('accepts characters discovered in a completed travel result', () => {
  expect(
    travelActivityViewSchema.safeParse({
      kind: 'travel',
      activity_id: '11111111-1111-4111-8111-111111111111',
      route_id: 'selene_to_mossway',
      from: { id: 'selene', name: 'Selene', kind: 'town' },
      to: { id: 'mossway', name: 'Mossway', kind: 'field' },
      started_at: '2026-09-12T00:00:00.000Z',
      arrives_at: '2026-09-12T00:00:15.000Z',
      duration_seconds: 15,
      status: 'ENDED',
      ended_at: '2026-09-12T00:00:15.000Z',
      end_reason: 'COMPLETED',
      characters: [
        {
          public_id: 'Alicia',
          display_name_ref: 'character:Alicia:name',
          lang: 'ja',
        },
      ],
    }).success,
  ).toBe(true);
});

function inventoryItem(definition_id: string, name: string) {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    definition_id,
    name,
    quantity: 1,
    unit_weight: 1,
    tradeable: true,
    slot: null,
    quality: null,
    durability: null,
    max_durability: null,
  };
}

it('accepts the new wolf items as item IDs', () => {
  expect(itemIdSchema.safeParse('wolf_meat').success).toBe(true);
  expect(itemIdSchema.safeParse('wolf_jerky').success).toBe(true);
});

it('accepts wolf meat and wolf jerky in inventory responses', () => {
  expect(
    agentGameResponseSchema.safeParse({
      ok: true,
      schema_version: '2.0',
      server_time: '2026-09-12T00:00:00.000Z',
      locale: 'en',
      user_content: [],
      data: {
        inventory: [
          inventoryItem('wolf_meat', 'Wolf Meat'),
          inventoryItem('wolf_jerky', 'Wolf Jerky'),
        ],
      },
    }).success,
  ).toBe(true);
});

it('accepts wolf meat loot and the wolf jerky recipe', () => {
  expect(
    combatReportSchema.safeParse({
      activity_id: '11111111-1111-4111-8111-111111111111',
      outcome: 'VICTORY',
      practice: false,
      elapsed_seconds: 10,
      damage_dealt: 10,
      damage_taken: 2,
      healing: 0,
      potions_used: 0,
      experience_gained: 5,
      loot: [{ item_id: 'wolf_meat', name: 'Wolf Meat', quantity: 1 }],
      unclaimed_loot: [],
      rules: [],
      frames: [],
    }).success,
  ).toBe(true);

  expect(
    recipeViewSchema.safeParse({
      recipe_id: 'wolf_jerky',
      name: 'Wolf Jerky',
      inputs: [
        {
          item_id: 'wolf_meat',
          name: 'Wolf Meat',
          quantity: 2,
          unit_weight: 1,
          owned_quantity: 0,
          missing_quantity: 2,
        },
      ],
      output: {
        item_id: 'wolf_jerky',
        name: 'Wolf Jerky',
        quantity: 1,
        unit_weight: 1,
      },
      facility: null,
      location_available: true,
      unavailable_reasons: [],
      skill_id: 'cooking',
      required_level: 1,
      experience: 9,
      base_duration_seconds: 90,
      fee_per_lot: 0,
      duration_seconds: 90,
    }).success,
  ).toBe(true);
});

it('accepts gathered nuts as a resource item', () => {
  expect(
    resourceViewSchema.safeParse({
      resource_id: 'mossway_food',
      location_id: 'mossway',
      item_id: 'food',
      name: 'Nuts',
      quantity: 10,
      capacity: 60,
      recovery_quantity: 1,
      recovery_seconds: 15,
      observed_at: '2026-09-12T00:00:00.000Z',
      next_recovery_at: null,
      base_duration_seconds: 45,
      required_tool: null,
    }).success,
  ).toBe(true);
});

it('uses only cooked recovery foods and rejects raw ingredients', () => {
  for (const item_id of ['healing_potion', 'travel_ration', 'wolf_jerky']) {
    expect(
      useItemSchema.safeParse({ character_id: 'Traveler', item_id }).success,
    ).toBe(true);
  }
  for (const item_id of ['wolf_meat', 'food', 'herb']) {
    expect(
      useItemSchema.safeParse({ character_id: 'Traveler', item_id }).success,
    ).toBe(false);
  }
});
