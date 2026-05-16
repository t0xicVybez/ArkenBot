# ARK Manager

Manage your ARK: Survival Evolved server from Discord via RCON.

## Setup

1. Enable RCON in your ARK server settings (add `-NoTransferFromFiltering` and set RCON port in `GameUserSettings.ini`)
2. Install the **ARK Manager** addon from the Addon Manager
3. Run `/ark setup`:

| Option | Required | Description |
|---|---|---|
| `host` | Yes | Server IP or hostname |
| `password` | Yes | RCON password |
| `port` | No | RCON port (default: `27020`) |
| `staff_role` | No | Role allowed to use staff commands |
| `admin_role` | No | Role allowed to use admin commands |

## Commands

### Status & Players

| Command | Description |
|---|---|
| `/ark status` | Show server status and player count |
| `/ark players` | List all players currently online |

### Staff Commands

| Command | Description |
|---|---|
| `/ark kick <steamid> [reason]` | Kick a player by Steam64 ID |
| `/ark broadcast <message>` | Send a message to all players |

### Admin Commands

| Command | Description |
|---|---|
| `/ark ban <steamid> [reason]` | Ban a player |
| `/ark unban <steamid>` | Unban a player |
| `/ark save` | Save the world |
| `/ark rcon <command>` | Execute a raw RCON command |

## Disabling

Run `/ark disable` to remove the integration.
