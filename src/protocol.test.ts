import { expect, it } from 'vitest';
import {
  agentGameResponseSchema,
  agentSchemaVersion,
  guideResponseSchema,
} from './protocol.js';
import { combatReportSchema, useItemSchema } from './protocol/combat.js';
import {
  agentCombatResultSchema,
  agentRestResultSchema,
} from './protocol/activity.js';
import { itemIdSchema } from './protocol/ids.js';
import { recipeViewSchema } from './protocol/production.js';
import { lookResourceSchema } from './protocol/movement.js';

it('accepts the three guide response shapes', () => {
  const responses = [
    {
      guide: {
        topics: [{ id: 'overview', title: 'Overview', summary: 'Start here.' }],
      },
    },
    {
      guide: {
        section: {
          id: 'overview',
          title: 'Overview',
          summary: 'Start here.',
          body: '# Overview',
        },
      },
    },
    {
      guide: {
        matches: [
          {
            topic_id: 'overview',
            title: 'Overview',
            heading: 'Overview',
            text: 'Start here.',
            topic_body_bytes: 42,
          },
        ],
        truncated: false,
      },
    },
  ];

  for (const response of responses)
    expect(guideResponseSchema.parse(response)).toEqual(response);
});

it('accepts the compact profile receipt', () => {
  expect(
    agentGameResponseSchema.safeParse({
      ok: true,
      schema_version: agentSchemaVersion,
      server_time: '2026-09-12T00:00:00.000Z',
      data: { profile_saved: { preferred_locale: 'en' } },
    }).success,
  ).toBe(true);
});

it('keeps the repair receipt from an equipment repair', () => {
  const response = {
    ok: true,
    schema_version: agentSchemaVersion,
    server_time: '2026-09-12T00:00:00.000Z',
    data: {
      repair: {
        equipment_id: '11111111-1111-4111-8111-111111111111',
        durability: 50,
        max_durability: 50,
        kits_used: 1,
        fee_paid: 3,
      },
    },
  };
  expect(agentGameResponseSchema.parse(response)).toEqual(response);
});

it('requires a position in character responses', () => {
  const character = {
    character_id: 'Aster0000000',
    discriminator: '0001',
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
    schema_version: agentSchemaVersion,
    server_time: '2026-09-12T00:00:00.000Z',
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
    schema_version: agentSchemaVersion,
    server_time: '2026-09-12T00:00:00.000Z',
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
    schema_version: agentSchemaVersion,
    server_time: '2026-09-12T00:00:15.000Z',
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
            character_id: 'Alicia000000',
            discriminator: '0002',
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
        character_id: 'Alicia000000',
        discriminator: '0002',
        lang: 'ja',
        user_content: { display_name: 'アリシア' },
      },
    ],
  });
});

function stackRow(item_id: string, name: string) {
  return {
    kind: 'stack',
    item_id,
    name,
    quantity: 1,
    unit_weight: 1,
    tradeable: true,
  };
}

function equipmentRow(
  item_id: string,
  name: string,
  quality: 'standard' | 'fine' | 'superior' = 'standard',
) {
  return {
    kind: 'equipment',
    equipment_id: '00000000-0000-4000-8000-000000000001',
    item_id,
    name,
    unit_weight: 1,
    tradeable: true,
    quality,
    durability: 100,
    max_durability: 100,
    slot: null,
    equipment: {
      equip_slot: 'main_hand',
      required_job: 'warrior',
      required_job_name: 'Warrior',
      power: 9,
      armor: 0,
    },
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
      schema_version: agentSchemaVersion,
      server_time: '2026-09-12T00:00:00.000Z',
      data: {
        inventory: [
          stackRow('wolf_meat', 'Wolf Meat'),
          stackRow('wolf_jerky', 'Wolf Jerky'),
        ],
      },
    }).success,
  ).toBe(true);
});

it('accepts non-standard qualities on individual items', () => {
  expect(
    agentGameResponseSchema.safeParse({
      ok: true,
      schema_version: agentSchemaVersion,
      server_time: '2026-09-12T00:00:00.000Z',
      data: {
        inventory: [
          equipmentRow('iron_sword', 'Iron Sword', 'fine'),
          equipmentRow('iron_dagger', 'Iron Dagger', 'superior'),
        ],
      },
    }).success,
  ).toBe(true);
});

it('rejects the flat inventory row that has no kind', () => {
  expect(
    agentGameResponseSchema.safeParse({
      ok: true,
      schema_version: agentSchemaVersion,
      server_time: '2026-09-12T00:00:00.000Z',
      data: {
        inventory: [
          {
            id: '00000000-0000-4000-8000-000000000001',
            definition_id: 'wolf_meat',
            name: 'Wolf Meat',
            quantity: 1,
            unit_weight: 1,
            tradeable: true,
            slot: null,
            quality: null,
            durability: null,
            max_durability: null,
          },
        ],
      },
    }).success,
  ).toBe(false);
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
      gold_gained: 2,
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
          owned_quantity: 0,
          missing_quantity: 2,
        },
      ],
      output: {
        item_id: 'wolf_jerky',
        name: 'Wolf Jerky',
        quantity: 1,
      },
      facility: null,
      unavailable_reasons: [],
      skill_id: 'cooking',
      required_level: 1,
      experience: 9,
      fee_per_lot: 0,
      duration_seconds: 90,
    }).success,
  ).toBe(true);
});

it('requires a confirmed summary on a settled combat or rest result', () => {
  const activityId = '11111111-1111-4111-8111-111111111111';
  const ended = {
    activity_id: activityId,
    status: 'ENDED',
    ended_at: '2026-09-12T00:00:10.000Z',
  };
  const settled = {
    ...ended,
    kind: 'combat',
    end_reason: 'VICTORY',
    enemy_id: 'wolf',
    enemy_name: 'Wolf',
    practice: false,
    summary: {
      experience: { job_id: 'mage', awarded: 10 },
      gold_gained: 2,
      loot: [{ item_id: 'wolf_meat', name: 'Wolf Meat', quantity: 1 }],
      unclaimed_loot: [],
      potions_used: 0,
    },
  };
  expect(agentCombatResultSchema.safeParse(settled).success).toBe(true);
  const { summary: _summary, ...withoutSummary } = settled;
  expect(agentCombatResultSchema.safeParse(withoutSummary).success).toBe(false);

  const cancelled = {
    ...ended,
    kind: 'combat',
    end_reason: 'CANCELLED',
    summary: null,
  };
  expect(agentCombatResultSchema.safeParse(cancelled).success).toBe(true);
  expect(
    agentCombatResultSchema.safeParse({ ...settled, end_reason: 'CANCELLED' })
      .success,
  ).toBe(false);

  const rest = {
    ...ended,
    kind: 'rest',
    end_reason: 'COMPLETED',
    summary: { hp: 100, mp: 100, weakened_until: null },
  };
  expect(agentRestResultSchema.safeParse(rest).success).toBe(true);
  expect(
    agentRestResultSchema.safeParse({ ...rest, summary: undefined }).success,
  ).toBe(false);
});

it('accepts the compact character status alongside other data', () => {
  expect(
    agentGameResponseSchema.safeParse({
      ok: true,
      schema_version: agentSchemaVersion,
      server_time: '2026-09-12T00:00:00.000Z',
      data: {
        status: {
          character_id: 'Aster0000000',
          job_id: 'mage',
          hp: 90,
          max_hp: 100,
          mp: 40,
          max_mp: 100,
          gold: 100,
          level: 2,
          experience: 60,
          weakened_until: null,
        },
      },
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
      useItemSchema.safeParse({ character_id: 'Traveler0000', item_id })
        .success,
    ).toBe(true);
  }
  for (const item_id of ['wolf_meat', 'food', 'herb']) {
    expect(
      useItemSchema.safeParse({ character_id: 'Traveler0000', item_id })
        .success,
    ).toBe(false);
  }
});

it('accepts operation and note hints and rejects other shapes', () => {
  const result = {
    ok: true,
    schema_version: agentSchemaVersion,
    server_time: '2026-09-12T00:00:00.000Z',
    data: {},
  };
  expect(
    agentGameResponseSchema.safeParse({
      ...result,
      hints: [
        { operation: 'hello', arguments: { character_id: 'Aster0000000' } },
        { note: 'Save a goal spanning several activities in the plan.' },
      ],
    }).success,
  ).toBe(true);
  for (const hints of [
    [{ operation: 'hello', arguments: { character_id: 7 } }],
    [{ operation: 'hello', note: 'Two forms at once.' }],
    [{ note: '' }],
    [{ arguments: { character_id: 'Aster0000000' } }],
  ]) {
    expect(
      agentGameResponseSchema.safeParse({
        ...result,
        hints,
      }).success,
    ).toBe(false);
  }
});
