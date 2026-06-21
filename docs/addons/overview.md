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
| [RSM Manager](rsm-manager.md) | Manage game servers via Ronin Server Manager with live status monitoring |
| [Code Review](code-review.md) | AI-powered code analysis and formatting |
| [Application System](applications.md) | Application forms with modal collection, accept/deny workflow, and role assignment |

## How Addons Work

- Commands from installed addons appear in `/help` automatically
- Addon commands follow the same [role permission rules](../setup/command-permissions.md) as built-in commands
- Addon settings are configured per-server from the Addon Manager

## Command Permissions

All addon commands respect the role permission rules configured in **Commands → Role Permissions**. Admins always bypass these rules.
