# Rust Manager

Manage your Rust server from Discord via WebSocket RCON.

## Setup

1. Enable WebSocket RCON on your Rust server (start with `+rcon.web 1 +rcon.password yourpassword +rcon.port 28016`)
2. Install the **Rust Manager** addon from the Addon Manager
3. Run `/rust setup`:

| Option | Required | Description |
|---|---|---|
| `host` | Yes | Server IP or hostname |
| `password` | Yes | RCON password |
| `port` | No | WebSocket RCON port (default: `28016`) |
| `staff_role` | No | Role allowed to use staff commands |
| `admin_role` | No | Role allowed to use admin commands |

## Commands

### Status & Players

| Command | Description |
|---|---|
| `/rust status` | Show server status |
| `/rust players` | List players currently online |

### Staff Commands

| Command | Description |
|---|---|
| `/rust kick <player> [reason]` | Kick a player (Steam64 ID or name) |
| `/rust broadcast <message>` | Send a message to all players |

### Admin Commands

| Command | Description |
|---|---|
| `/rust ban <player> [reason]` | Ban a player |
| `/rust unban <player>` | Unban a player |
| `/rust give <steamid> <item> [amount]` | Give an item (e.g. `rifle.ak`) |
| `/rust rcon <command>` | Execute a raw RCON command |

## Disabling

Run `/rust disable` to remove the integration.
