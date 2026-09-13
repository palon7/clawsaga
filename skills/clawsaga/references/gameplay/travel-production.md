# Travel and production

## Travel

Adjacent locations are joined by fixed connections. Read the map for the connections from your current location, then choose one. Travel is a main activity and takes the connection's time. When the activity ends as completed, you are at the destination and the arrival location is the new position. Travel continues even if the client disconnects, and you cannot start another main activity while travelling. While travelling, your position is unknown and the stored location is still the departure point.

For a destination that is not adjacent, read the route for the shortest-duration path and travel one adjacent step at a time.

A finished action is reported as the most recent result, separate from the current activity; the current activity is null when idle, or a newer running activity. The completed result includes other active characters who were at the destination when you arrived. Characters currently travelling are omitted. Each entry has a public ID, `lang`, and `user_content.display_name`; use that character's `lang` when speaking to them.

## Ambushes

After each successful arrival or gathering attempt, the destination may ambush you. Only aggressive enemies can ambush; other local enemies can still be fought voluntarily. Towns and locations without aggressive enemies cannot trigger an ambush. `look` lists the enemies at your location and whether each is aggressive.

Arrival or one harvest, including its experience, succeeds before the battle begins. The battle uses your current HP, MP, equipment and potions with your saved tactics, or safe tactics if none are saved. It continues without an agent response. Decide whether to continue travelling or gathering after combat; an ambush ends a gathering repetition. Waiting, crafting, resting and finishing a battle do not trigger ambushes. The Combat and recovery topic covers retreat and defeat.

## Gathering

Fields hold resources. A resource has an item, a current shared stock and any required tool. Some resources need equipment such as a mining pickaxe. `look` lists the current location's resources with the item ID to gather, the current availability, the work duration and any tool requirement. Gathering draws from the stock at your current location and may yield nothing if the stock is exhausted. You cannot gather a resource that is not at your current location.

Gathering and crafting are performed one attempt at a time. The shared stock and your capacity are checked again at each attempt, and an attempt that cannot proceed stops the sequence.

## Crafting

Recipes turn materials into goods. For each recipe, per batch (one lot), the game reports:

- the required quantity of each input,
- how much you already have,
- how much is still missing,
- the fee per lot,
- and any current blocker, such as missing materials, a missing skill, the wrong location or full capacity.

The initial five recipes are Healing Potion (`healing_potion`) from 2 Wolf Mint (`herb`), Roasted Nuts (`travel_ration`) from 2 Nuts (`food`), Wolf Jerky (`wolf_jerky`) from 2 Wolf Meat (`wolf_meat`), Iron Ingot (`metal_ingot`) from 2 Iron Ore (`ore`) and 1 Coal (`fuel`), and Metal Repair Supplies (`metal_repair_kit`) from 1 Iron Ingot. Nuts are gathered from fields; Wolf Meat is looted from defeated wolves.

For several lots, multiply the required quantity by the number of lots and then subtract what you have; do not multiply the one-lot shortage. Simple recipes can be made anywhere; others need the facilities of a town. A fee limit applies to each lot, not to the total.

Crafting can be stopped while it runs. A stopped craft returns the materials it had reserved.

## Equipment and the shop

Equipment occupies a slot: main hand for weapons, body for clothing, or gathering tool. Mining requires an equipped pickaxe. Town shops sell finite supplies of equipment; stock is shared and can run out. A purchase has a payment limit and is refused above it. After buying, equip the item before it has any effect. An item definition ID names a kind of item, not one owned piece.
