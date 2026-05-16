# Addons Overview

Addons extend ArkenBot with specialized features beyond the core bot. Each addon is a self-contained module that adds slash commands, event listeners, and its own settings.

## Managing Addons

Go to **Addon Manager** in the sidebar to see all available addons and their status.

- **Install** — Enables the addon for your server
- **Configure** — Opens the addon's settings panel
- **Uninstall** — Disables the addon and removes its commands

## Available Addons

| Addon | Description |
|---|---|
| [Ticket System](tickets.md) | Full-featured support ticket system with panels, transcripts, SLA, and a portal |
| [Game Server Status](gameservers.md) | Check and monitor 40+ game server types |
| [FiveM Manager](fivem-manager.md) | Manage a FiveM server from Discord |
| [Minecraft Manager](minecraft-manager.md) | Manage a Minecraft server via RCON |
| [Rust Manager](rust-manager.md) | Manage a Rust server via WebSocket RCON |
| [ARK Manager](ark-manager.md) | Manage an ARK: Survival Evolved server via RCON |
| [Palworld Manager](palworld-manager.md) | Manage a Palworld server via REST API |
| [Code Review](code-review.md) | AI-powered code analysis and formatting |

## How Addons Work

- Commands from installed addons appear in `/help` automatically
- Addon commands follow the same [role permission rules](../setup/command-permissions.md) as built-in commands
- Addon settings are configured per-server from the Addon Manager

## Command Permissions

All addon commands respect the role permission rules configured in **Commands → Role Permissions**. Admins always bypass these rules.
