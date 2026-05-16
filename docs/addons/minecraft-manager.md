# Minecraft Manager

Manage your Minecraft server from Discord via RCON.

## Setup

1. Enable RCON in your Minecraft server's `server.properties`:
   ```
   enable-rcon=true
   rcon.password=yourpassword
   rcon.port=25575
   ```
2. Install the **Minecraft Manager** addon from the Addon Manager
3. Run `/minecraft setup`:

| Option | Required | Description |
|---|---|---|
| `host` | Yes | Server IP or hostname |
| `password` | Yes | RCON password |
| `port` | No | RCON port (default: `25575`) |
| `staff_role` | No | Role allowed to use staff commands |
| `admin_role` | No | Role allowed to use admin commands |

## Commands

### Status & Players

| Command | Description |
|---|---|
| `/minecraft status` | Show server status and player count |
| `/minecraft players` | List all players currently online |

### Staff Commands

| Command | Description |
|---|---|
| `/minecraft kick <player> [reason]` | Kick a player |
| `/minecraft ban <player> [reason]` | Ban a player |

### Admin Commands

| Command | Description |
|---|---|
| `/minecraft unban <player>` | Unban (pardon) a player |
| `/minecraft whitelist <add\|remove> <player>` | Manage the whitelist |
| `/minecraft op <player>` | Grant operator status |
| `/minecraft deop <player>` | Revoke operator status |
| `/minecraft give <player> <item> [amount]` | Give an item (e.g. `minecraft:diamond`) |
| `/minecraft gamemode <player> <mode>` | Change a player's gamemode |

## Disabling

Run `/minecraft disable` to remove the integration.
