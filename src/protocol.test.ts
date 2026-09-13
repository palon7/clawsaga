import { expect, it } from 'vitest';
import { agentGameResponseSchema } from './protocol.js';
import { combatReportSchema, useItemSchema } from './protocol/combat.js';
import { itemIdSchema } from './protocol/ids.js';
import { recipeViewSchema } from './protocol/production.js';
import { lookResourceSchema } from './protocol/movement.js';

it('accepts the compact profile receipt', () => {
  expect(
    agentGameResponseSchema.safeParse({
      ok: true,
      schema_version: '3.0',
      server_time: '2026-09-12T00:00:00.000Z',
      locale: 'en',
      data: { profile_saved: { preferred_locale: 'en' } },
    }).success,
  ).toBe(true);
});

it('requires a position in character responses', () => {
  const character = {
    public_id: 'Aster',
    preferred_locale: 'en',
    job_id: 'mage',
    job_name: 'Mage',
    town_id: 'crossroads',
    town_name: 'Crossroads',
    position: null,
    gold: 100,
    level: 1,
    experience: 0,
    hp: 100,
    max_hp: 100,
    mp: 100,
    max_mp: 100,
    weakened_until: null,
    jobs: [{ id: 'mage', level: 1, experience: 0 }],
    skills: [],
    reputation: { verden: 0, eisen: 0, ordelia: 0 },
    user_content: { display_name: 'Aster' },
  };
  const response = {
    ok: true,
    schema_version: '3.0',
    server_time: '2026-09-12T00:00:00.000Z',
    locale: 'en',
    data: { character },
  };
  expect(agentGameResponseSchema.safeParse(response).success).toBe(true);
  const { position: _position, ...withoutPosition } = character;
  expect(
    agentGameResponseSchema.safeParse({
      ...response,
      data: { character: withoutPosition },
    }).success,
  ).toBe(false);
});

it('rejects responses whose status and error disagree', () => {
  const result = {
    ok: true,
    schema_version: '3.0',
    server_time: '2026-09-12T00:00:00.000Z',
    locale: 'en',
    data: {},
  };
  expect(
    agentGameResponseSchema.safeParse({ ...result, ok: false }).success,
  ).toBe(false);
  expect(
    agentGameResponseSchema.safeParse({
      ...result,
      error: { message: 'Not found.' },
    }).success,
  ).toBe(false);
  expect(
    agentGameResponseSchema.safeParse({
      ...result,
      ok: false,
      error: { message: 'Not found.' },
    }).success,
  ).toBe(true);
  expect(
    agentGameResponseSchema.parse({
      ...result,
      ok: false,
      error: { message: 'Not found.', code: 'NOT_FOUND' },
    }).error,
  ).not.toHaveProperty('code');
});

it('accepts characters discovered in a completed travel result', () => {
  const response = agentGameResponseSchema.parse({
    ok: true,
    schema_version: '3.0',
    server_time: '2026-09-12T00:00:15.000Z',
    locale: 'en',
    data: {
      last_result: {
        kind: 'travel',
        activity_id: '11111111-1111-4111-8111-111111111111',
        to: { id: 'mossway', name: 'Mossway', kind: 'field' },
        status: 'ENDED',
        ended_at: '2026-09-12T00:00:15.000Z',
        end_reason: 'COMPLETED',
        characters: [
          {
            public_id: 'Alicia',
            lang: 'ja',
            user_content: { display_name: 'アリシア' },
          },
        ],
      },
    },
  });
  expect(response.data.last_result).toMatchObject({
    kind: 'travel',
    characters: [
      {
        public_id: 'Alicia',
        lang: 'ja',
        user_content: { display_name: 'アリシア' },
      },
    ],
  });
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
      schema_version: '3.0',
      server_time: '2026-09-12T00:00:00.000Z',
      locale: 'en',
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

it('accepts gathered nuts as a look resource', () => {
  expect(
    lookResourceSchema.safeParse({
      item_id: 'food',
      name: 'Nuts',
      quantity: 10,
      capacity: 60,
      recovery_quantity: 1,
      recovery_seconds: 15,
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

it('accepts only the exact hello next step in a create response', () => {
  const result = {
    ok: true,
    schema_version: '3.0',
    server_time: '2026-09-12T00:00:00.000Z',
    locale: 'en',
    data: {
      created: { public_id: 'Aster' },
      next_step: { operation: 'hello', arguments: { character_id: 'Aster' } },
    },
  };
  expect(agentGameResponseSchema.safeParse(result).success).toBe(true);
  for (const next_step of [
    { operation: 'goodbye', arguments: { character_id: 'Aster' } },
    { operation: 'hello', arguments: { character_id: 'Aster', extra: 'x' } },
    { operation: 'hello', arguments: { character_id: 'A' } },
    { operation: 'hello', arguments: {} },
  ]) {
    expect(
      agentGameResponseSchema.safeParse({
        ...result,
        data: { ...result.data, next_step },
      }).success,
    ).toBe(false);
  }
});
