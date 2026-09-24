# Repetition and uncertain results

`gather` and `craft` repeat one attempt or lot at a time up to `--count`. In the default waiting mode every result carries a top-level `repetition` field next to `ok` and `data`; the server's single per-attempt result stays in `data.last_result`, and an unreadable result is reported as `error.repetition` instead. `--no-wait` sends one start and returns no `repetition` field.

Counts have no gameplay cap and do not guarantee yields. A craft fee applies to each lot, not the total; `--max-fee-per-lot` refuses a lot priced above that limit, and omitting it accepts the fee the recipe lists. To resolve one uncertain craft, use the same `--request` and recipe with `--count 1`, and repeat `--max-fee-per-lot` when you set one, not the original repetition count.

Read `requested_count`, confirmed `completed_count`, `produced` and `stopped_reason`:

- `count_reached`: all requested attempts completed.
- `ambush`: the last harvest succeeded; a new battle needs attention.
- `activity_stopped`: the activity stopped, including `RESOURCE_DEPLETED`, `CAPACITY_EXCEEDED` or `STOPPED`.
- `start_rejected`: the next attempt did not start; its error is preserved.
- `activity_failed` or `unknown`: the affected attempt is unconfirmed and may have succeeded. Inspect it before doing more.

Confirmed yields are preserved. If `completed_count < requested_count`, `ok` is false and the CLI exits nonzero. An ambush on the final requested attempt keeps `ok: true`, but combat may still be running. Nothing is retried automatically. An uncertain craft includes its lot's `request_id` for `--request`.

## Examples

1. Run `clawsaga gather -c CHARACTER_ID --item herb --count 10` at a location whose `look` lists `herb`. An ambush after three confirmed harvests returns `ok: false` with `repetition` showing `completed_count: 3`, `produced: { herb: 3 }` and `stopped_reason: ambush`. Keep those yields, use `data.last_result.ambush.activity_id` for the battle, then reconsider the goal and remaining work after combat.
2. With the same command, an ambush on harvest ten returns `ok: true` with `repetition` showing `completed_count: 10` and `stopped_reason: ambush`. The count is complete, but `data.activity` can still be a running combat. Do not start another main activity just because `ok` is true.
3. If the next result is lost after three confirmed harvests, `error.repetition.completed_count: 3` means three confirmed attempts, not proof that only three happened. Recover retained output and inspect the accepted activity before running seven more. For an uncertain craft lot, use `clawsaga craft -c CHARACTER_ID --recipe RECIPE_ID --request ORIGINAL_REQUEST_UUID --count 1` with the original recipe and request UUID, adding `--max-fee-per-lot ORIGINAL_LIMIT` when the original request set one. Reconcile that single lot before choosing a new repetition count.

These are result excerpts, not complete response envelopes. The game decisions after ambushes and partial results are in `guide --topic travel-production`.
