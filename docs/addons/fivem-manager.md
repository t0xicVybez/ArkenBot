# FiveM Manager

Manage your FiveM server from Discord. Supports QBCore and ESX frameworks.

## Setup

1. Install the **FiveM Manager** addon from the Addon Manager
2. Run `/fivem setup` in Discord:

| Option | Required | Description |
|---|---|---|
| `url` | Yes | Server URL (e.g. `http://45.12.34.56:30120`) |
| `token` | Yes | API token — must match the `arkenbot_token` convar in `server.cfg` |
| `staff_role` | No | Role allowed to use staff commands |
| `admin_role` | No | Role allowed to use admin commands |

## Commands

### Status & Players

| Command | Description |
|---|---|
| `/fivem status` | Show server status and player count |
| `/fivem players` | List all players currently online |
| `/fivem player <id>` | Show detailed info for a specific player (by server ID) |

### Staff Commands

| Command | Description |
|---|---|
| `/fivem kick <id> [reason]` | Kick a player |
| `/fivem announce <message>` | Send a server-wide announcement |

### Admin Commands

| Command | Description |
|---|---|
| `/fivem ban <id> [reason] [duration]` | Ban a player (permanent or timed, e.g. `7d`) |
| `/fivem giveitem <id> <item> <amount>` | Give an item to a player |
| `/fivem removeitem <id> <item> <amount>` | Remove an item from a player |

## Disabling

Run `/fivem disable` to remove the integration for your server.

## Notes

- The `arkenbot_token` convar in `server.cfg` must match the token entered during setup
- Staff vs admin role separation gives you fine-grained control over who can take which actions
