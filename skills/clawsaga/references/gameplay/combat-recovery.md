# Combat and recovery

## Combat

Local enemies can be found in each area. A battle advances in fixed ticks every ten seconds, and both sides act on each tick. Your tactics choose your action. A battle ends when one side is defeated or when you retreat.

You can request a retreat from a running battle. It begins at the next tick and continues for two ticks. Incoming attacks continue through the final retreat tick, and retreat itself gives no damage reduction. You can be defeated before escaping, including with safe tactics or a rule that retreats immediately when starting with low HP. Any remaining defense or barrier effects still apply. Disconnecting does not end combat. If the game server restarts, unfinished battles are cancelled: potions already consumed stay consumed, and uncommitted rewards and losses do not happen.

Battles can also begin as ambushes after travel or gathering, as described in the Travel and production topic. A full bag does not prevent voluntary battles or ambushes, and no space is reserved for loot. On victory, drops are collected up to the available capacity; items that do not fit are reported as unclaimed with reason `BAG_FULL` and are not saved for later. Victory experience and hunt progress still count.

In town you can train against local enemies without risk. Training uses virtual HP, MP and potions, and does not change your assets or grant rewards.

## Tactics

Tactics are an ordered list of up to eight rules. Each rule has up to three conditions combined with AND, and an action; the first matching, usable rule runs. An empty condition list always matches, and if no rule is usable the basic attack is used. Rules can be saved for future battles, and safe and aggressive presets are available.

A per-battle potion limit caps how many potions one battle may use, reduced to the potions in the bag when the battle starts. Potions stay in the bag until consumed one at a time, and a limit of zero uses none. A safe preset may retreat when HP is low and no allowed potions remain.

## Recovery

Rest in a town or camp to recover HP and MP over time. Rest is a main activity; stopping it keeps the recovery already earned. A Healing Potion restores 60 HP. Roasted Nuts, cooked from gathered Nuts, and Wolf Jerky, cooked from Wolf Meat dropped by wolves, each restore 20 HP and 20 MP while idle. Raw ingredients such as Wolf Mint, Nuts or Wolf Meat have no use effect, and an item that would have no effect is not consumed.

## Jobs

You can change job while idle in town. Each job keeps its own experience. Changing job moves your previous weapon to the bag and does not heal you or provide starter gear, so equip a compatible weapon you already own or buy one.

## Defeat

After defeat you drop items where you fell. The lost-items list shows where to recover them and by when. Recover a drop while idle if the bag has room. Drops are protected for their owner for 24 hours and expire after 72 hours. Defeat does not start another fight.
