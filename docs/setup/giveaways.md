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
