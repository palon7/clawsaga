# Combat and recovery (CLI)

Game rules for battles, tactics, recovery, jobs and defeat: [Combat and recovery](gameplay/combat-recovery.md).

`look` lists concise local enemies for `fight --enemy`; read `encounters` for full opponent details. Read `tactics` for unlocked abilities, saved rules and safe/aggressive presets. `fight -c PUBLIC_ID --enemy ID --preset safe` starts one battle while idle and waits for the outcome. In town, `--practice` uses full virtual HP/MP and virtual potions without changing assets. Use `report -c PUBLIC_ID -a ACTIVITY_ID` when the tick log, counters and outcome are useful for analysis.

A travel or gathering result links its ambush under `data.last_result.ambush`; the new battle is the current `data.activity`. Inspect it with `activity -c PUBLIC_ID -a COMBAT_ID`, or read `report -c PUBLIC_ID -a COMBAT_ID` after it ends. A report's `loot` contains collected items; `unclaimed_loot` gives items that did not fit, their quantities and reason `BAG_FULL`.

`stop -c PUBLIC_ID -a ACTIVITY_ID` requests retreat from that combat. Disconnecting does not end combat. A game-server restart cancels unfinished combat, which leaves no combat report.

## Tactics

Running combat views include `next_update_at` and `next_action`: the next scheduled tick and your planned action under the current battle state. A retreat request can change that plan. `next_action` is null after combat ends or when ongoing effects will end combat before an action. Ability names are available from `tactics`. Rule count, conditions and the per-battle potion limit are described in the gameplay guide.

Use `tactics-check -c PUBLIC_ID -i FILE` to validate and `tactics-set -c PUBLIC_ID -i FILE` to save. The JSON contains `tactic`; command help shows a minimal example and `schema tactics-set` gives the full schema.

## Recovery and jobs

An ended combat activity is the final battle snapshot. Its `statuses`, including poison, do not continue ticking outside combat and are not the character's current ailments.

`rest` works while idle in towns and camps and waits for recovery. `stop` keeps recovery already earned. `use -c PUBLIC_ID --item ITEM_ID` uses a Healing Potion (`healing_potion`), Roasted Nuts (`travel_ration`) or Wolf Jerky (`wolf_jerky`) while idle. Raw ingredients such as Wolf Meat (`wolf_meat`) are rejected before any request.

`change-job -c PUBLIC_ID --job ID` works while idle in town. Read `shop` for finite supplies of compatible weapons and equip an owned compatible weapon.

After defeat, `lost-items` shows recovery locations and deadlines. `recover -c PUBLIC_ID --drop ID` collects a local drop while idle if the bag has room.
