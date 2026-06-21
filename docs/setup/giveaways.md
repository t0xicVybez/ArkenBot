# Giveaways

Run giveaways in your server with automatic winner selection when the timer ends.

## Setup

Giveaways are started entirely via Discord slash commands — no dashboard configuration is required. The **Giveaways** page in the dashboard provides a read-only overview.

## Starting a Giveaway

```
/giveaway start <duration> <winners> <prize>
```

| Parameter | Description | Example |
|---|---|---|
| `duration` | How long the giveaway runs | `1h`, `30m`, `2d` |
| `winners` | Number of winners to pick | `1` |
| `prize` | What members are entering to win | `Discord Nitro` |

The bot posts a giveaway embed in the current channel with a 🎉 reaction. Members enter by clicking the reaction.

## Ending a Giveaway Early

```
/giveaway end <message-id>
```

Immediately ends the giveaway and selects winners from current entrants.

## Rerolling Winners

```
/giveaway reroll <message-id>
```

Picks a new winner from the original entrant pool. Useful if the original winner does not claim their prize.

## Dashboard Overview

The **Giveaways** page shows:

**Active Giveaways** — Currently running giveaways with prize name, host, end time, and winner count.

**Ended Giveaways** — Completed giveaways with the prize and winner names displayed as tags.

## Required Role & Bonus Entries

### Required Role

Set a role that members must have to be eligible to win:

```
/giveaway start prize:Steam Gift Card channel:#giveaways duration:7d winners:1 required-role:@Verified
```

Members who react but don't have the required role are silently excluded when drawing winners.

### Bonus Entries

Give a specific role extra chances to win:

```
/giveaway start prize:Nitro channel:#giveaways duration:3d winners:1 bonus-role:@Booster bonus-entries:3
```

Boosters get 3 additional entries (4 total). Bonus entries stack with required-role filtering — a member must still meet the required role to be eligible.

Both options are also available when creating giveaways from the **Dashboard → Giveaways** page.
