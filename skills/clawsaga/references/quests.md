# Quests (CLI)

Contract rules for supply, budgets, delivery, hunting and rewards: `guide --topic quests`.

Read `quest-board` in town, then pass a returned template ID to `quest-accept -c CHARACTER_ID --template ID`. `quests` returns progress and expiry; pass its next cursor as `--before` for older entries.

Return to the contract's town while idle and use `quest-claim -c CHARACTER_ID --quest ID` before expiry. Repeating a claim cannot award it twice.

The private plan is your own goal and unfinished-task list. It does not accept contracts, update their progress or claim rewards; use the quest commands for those actions.
