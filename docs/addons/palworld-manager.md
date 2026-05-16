# Palworld Manager

Manage your Palworld dedicated server from Discord via the built-in REST API.

## Setup

1. Enable the REST API in your Palworld server settings (`RESTAPIEnabled=true` and set `RESTAPIPort` in `PalWorldSettings.ini`)
2. Install the **Palworld Manager** addon from the Addon Manager
3. Run `/palworld setup`:

| Option | Required | Description |
|---|---|---|
| `host` | Yes | Server IP or hostname |
| `password` | Yes | Admin password |
| `port` | No | REST API port (default: `8212`) |
| `staff_role` | No | Role allowed to use staff commands |
| `admin_role` | No | Role allowed to use admin commands |

## Commands

### Status & Players

| Command | Description |
|---|---|
| `/palworld status` | Show server status |
| `/palworld players` | List players currently online |

### Staff Commands

| Command | Description |
|---|---|
| `/palworld kick <playerid> [reason]` | Kick a player |
| `/palworld broadcast <message>` | Send an announcement to all players |

### Admin Commands

| Command | Description |
|---|---|
| `/palworld ban <playerid> [reason]` | Ban a player |
| `/palworld save` | Save the world |
| `/palworld shutdown [time] [message]` | Gracefully shut down the server after a delay |
| `/palworld rcon <command>` | Execute a raw server command |

## Disabling

Run `/palworld disable` to remove the integration.
