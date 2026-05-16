# Utility Commands

General-purpose commands available to all members.

---

## /help

Browse all commands available to you. The list is filtered based on:
- Commands the server has disabled
- Commands from addons that aren't installed/enabled
- Your Discord permissions
- Role-based command permissions configured by server admins

No options. Navigation uses buttons to page through command categories.

---

## /ping

Check the bot's current latency and API response time.

No options.

---

## /serverinfo

Display information about the current server: member count, creation date, boost level, channels, roles, and more.

No options.

---

## /userinfo

Display information about a user: account age, joined date, roles, badges, and more.

| Option | Required | Description |
|---|---|---|
| `user` | No | The user to look up (defaults to yourself) |

---

## /avatar

Get a user's avatar as a full-size image with a download link.

| Option | Required | Description |
|---|---|---|
| `user` | No | The user (defaults to yourself) |

---

## /remind

Set a personal reminder. The bot will DM you when the time is up.

| Option | Required | Description |
|---|---|---|
| `time` | Yes | When to remind you (e.g. `10m`, `2h`, `1d`) |
| `message` | Yes | What to remind you about |

---

## /giveaway

Manage giveaways. See [Giveaways Setup](../setup/giveaways.md) for full details.

### Subcommands

| Subcommand | Description |
|---|---|
| `start <prize> <duration> [winners]` | Start a new giveaway in the current channel |
| `end <id>` | End a giveaway early and select winners |
| `reroll <id>` | Pick new winners from the original entrant pool |

---

## /botstatus

Show a quick summary of the bot's current status, uptime, and resource usage.

No options.
