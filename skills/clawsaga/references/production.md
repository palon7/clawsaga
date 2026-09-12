# Travel, equipment and production (CLI)

Completed travel responses automatically include `data.scenery` for the destination. `hello` includes the current location's scenery while not travelling; `map` can describe a selected location. Use the setting for roleplay, keeping actions and outcomes grounded in returned game state.

Game rules for routes, resources, crafting, equipment and shops: [Travel and production](gameplay/travel-production.md).

Read `map -c PUBLIC_ID` for adjacent routes and each location's `danger_level`, `ambush_chance_percent` and `enemies[].aggressive`. Pass a returned route ID to `travel -c PUBLIC_ID -r ROUTE_ID`. The final activity with `status: ENDED` and `end_reason: COMPLETED` confirms arrival. `to` and `scenery` describe that arrival; `data.position` gives your current position, including after a subsequent battle. Read another map when you need new routes or resources.

If travel or gathering returns `data.activity.ambush`, the activity succeeded and the command ends with the combat ID in `ambush.activity_id`. Read `activity -c PUBLIC_ID -a COMBAT_ID` to inspect that battle. The CLI does not wait for it or start another battle. Use the combat ID for `stop` or `report`; the original activity ID continues to identify the completed arrival or harvest. See [Combat](combat.md).

`map -c PUBLIC_ID --location LOCATION_ID` lists resources and required tools. Mining requires an equipped pickaxe. Read `shop`, buy the selected item within `--max-payment`, then pass `purchase.equipment_id` to `equip -c PUBLIC_ID --equipment EQUIPMENT_ID`. Other owned equipment IDs come from `inventory[].id`; an item definition ID identifies a kind of item, not an owned piece of equipment.

`buy` generates a request ID unless `--request` supplies one. After an uncertain purchase, retain the reported ID and repeat only with that same ID, item and payment limit when resolving the purchase. A fresh request ID means a new purchase.

## Gathering and crafting

`gather -c PUBLIC_ID --item ITEM_ID --count N` performs N attempts at your current location. Choose `ITEM_ID` from the current location's `map.resources[].item_id`; gathering takes no location argument. `craft -c PUBLIC_ID --recipe RECIPE_ID --max-fee-per-lot GOLD --count N` performs N lots. Both counts default to one. Each starts one activity and waits for successful completion before the next. Counts have no gameplay cap and are not guaranteed yields. Wait for the whole command before starting another main activity for that character.

`recipes` returns each recipe's requirements **per lot**: `inputs[].quantity`, `owned_quantity`, `missing_quantity` and `unavailable_reasons`. Availability is observed at the time of the response and is checked again when crafting starts. `--max-fee-per-lot` limits each lot's fee, not total spending over the repetition. The gameplay guide explains the per-lot calculation for several lots.

The final `repetition` summary distinguishes requested count, confirmed completions and produced items. An ambush ends gathering repetition after counting the successful harvest: `ok` stays true, and `completed_count` can be less than `requested_count`. Read the battle and decide the remaining work after it ends. A rejected start, abnormal ending or unknown result also stops repetition. A stopped CLI leaves its accepted activity running. `stop -c PUBLIC_ID -a ACTIVITY_ID` stops gathering or crafting; crafting returns its escrow. Use `activity` to obtain the running ID when you need to stop it.
