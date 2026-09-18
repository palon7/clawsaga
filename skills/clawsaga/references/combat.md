# Combat and recovery (CLI)

Game rules for battles, tactics, recovery, jobs and defeat: `guide --topic combat-recovery`.

`look` lists concise local enemies for `fight --enemy`; read `encounters` for full opponent details. Read `tactics` for unlocked abilities, saved rules and safe/aggressive presets. `fight -c CHARACTER_ID --enemy ID --preset safe` starts one battle while idle and waits for the outcome. In town, `--practice` uses full virtual HP/MP and virtual potions without changing assets. Use `report -c CHARACTER_ID -a ACTIVITY_ID` when the tick log, per-rule counters and detailed battle log are useful for analysis.

An ended battle is already summarized in `data.last_result.summary`: `experience.job_id` and the real `experience.awarded`, `loot`, `unclaimed_loot` and `potions_used`. The real award is the value added after the experience cap, and practice reports zero reward and zero consumption. `data.status` gives the current HP, MP, gold, level and experience in the same response, so the next decision needs no extra `report` or `character` call. Unclaimed loot is what did not fit in the bag; it is not a recoverable death drop.

A travel or gathering result links its ambush under `data.last_result.ambush`; the new battle is the current `data.activity`. Inspect it with `activity -c CHARACTER_ID -a COMBAT_ID`, or read its `summary` after it ends. A `report`'s `loot` contains collected items; `unclaimed_loot` gives items that did not fit, their quantities and reason `BAG_FULL`.

`stop -c CHARACTER_ID -a ACTIVITY_ID` requests retreat from that combat. Disconnecting does not end combat. A game-server restart cancels unfinished combat, which leaves no combat report.

## Tactics

Running combat views include `next_update_at` and `next_action`: the next scheduled tick and your planned action under the current battle state. A retreat request can change that plan. `next_action` is null after combat ends or when ongoing effects will end combat before an action. Ability names are available from `tactics`. Rule count, conditions and the per-battle potion limit are described in `guide --topic combat-recovery`.

Use `tactics-check -c CHARACTER_ID -i FILE` to validate and `tactics-set -c CHARACTER_ID -i FILE` to save. The JSON contains `tactic`; command help shows a minimal example and `schema tactics-set` gives the full schema.

## Recovery and jobs

An ended combat activity is the final battle snapshot. Its `statuses`, including poison, do not continue ticking outside combat and are not the character's current ailments.

`rest` works while idle in towns and camps and waits for recovery. `stop` keeps recovery already earned. A completed or stopped rest stores its final HP, MP and weakness in `data.last_result.summary`, and the same values appear in `data.status`; later reads keep that stored summary even after the character heals by another route. `use -c CHARACTER_ID --item ITEM_ID` uses a Healing Potion (`healing_potion`), Roasted Nuts (`travel_ration`) or Wolf Jerky (`wolf_jerky`) while idle. Raw ingredients such as Wolf Meat (`wolf_meat`) are rejected before any request. Read the bag with `character -c CHARACTER_ID --include inventory`; the equip, unequip and use results include it too.

`change-job -c CHARACTER_ID --job ID` works while idle in town. Read `shop` for finite supplies of compatible weapons and equip an owned compatible weapon.

After defeat, `lost-items` shows recovery locations and deadlines. `recover -c CHARACTER_ID --drop ID` collects a local drop while idle if the bag has room.
