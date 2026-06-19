---
id: rsm-manager
sidebar_label: RSM Manager
---

# RSM Manager

Manage game servers running under [Ronin Server Manager (RSM)](https://github.com/t0xicVybez/rsm) directly from Discord. Supports starting, stopping, sending console commands, checking player lists, and a live auto-updating status embed.

## Setup

1. Install the **RSM Manager** addon from the Addon Manager
2. Run `/rsm setup` in Discord:

| Option | Required | Description |
|---|---|---|
| `url` | Yes | RSM API URL — e.g. `http://your-server-ip:3002` |
| `apikey` | Yes | API key from `rsm-api.json` in your `AppData/Roaming` folder |

After setup, ArkenBot will confirm how many servers RSM has registered.

## Permission Tiers

| Permission | Who has it | What it unlocks |
|---|---|---|
| **Admin** | Discord Administrators | `setup`, `setrole`, `monitor`, `unmonitor` |
| **Operator** | Admins + configured operator role | `start`, `stop`, `command` |
| **Everyone** | All members | `list`, `status`, `players` |

Set the operator role with `/rsm setrole <role>`. Omit the role argument to clear it (reverts operator commands to Admins only).

## Commands

### Viewing Servers

| Command | Description |
|---|---|
| `/rsm list` | List all managed servers with status, type, CPU, and RAM |
| `/rsm status <server>` | Detailed embed for a single server (status, PID, CPU, RAM) |
| `/rsm players <server>` | Show connected players and player count |

### Operator Commands

| Command | Description |
|---|---|
| `/rsm start <server>` | Start a stopped server |
| `/rsm stop <server>` | Stop a running server |
| `/rsm command <server> <cmd>` | Send a raw console command and see the output |

All server arguments use autocomplete — servers are fetched live from RSM and filtered as you type, showing their current status emoji (🟢 Online · 🟡 Starting · 🔴 Offline).

### Admin Commands

| Command | Description |
|---|---|
| `/rsm setup` | Connect RSM to this Discord server |
| `/rsm setrole [role]` | Set (or clear) the operator role |
| `/rsm monitor <channel> [interval]` | Start a live-updating status embed |
| `/rsm unmonitor` | Stop the auto-updating embed |

## Status Monitor Channel

`/rsm monitor` posts a single embed in the chosen channel that automatically edits itself on a configurable interval (default: every 5 minutes, min 1, max 60). The embed lists every server with its status, type, CPU usage, and RAM usage.

- If the embed message is manually deleted, the monitor posts a fresh one on the next tick.
- The monitor survives bot restarts — active monitors are restored automatically when the bot comes back online.
- Stop it at any time with `/rsm unmonitor`.

## Disabling

To remove the RSM integration from your server, uninstall the addon from the Addon Manager. This removes all `/rsm` commands from your server.
