---
id: custom-commands
sidebar_label: Custom Commands
---

# Custom Commands

Create text or embed responses that trigger when a member uses a slash command. Custom commands appear in `/help` alongside built-in commands and follow the same role permission rules.

## Creating a Command

Go to **Commands** in the dashboard sidebar and click **New Command**.

| Field | Description |
|---|---|
| **Name** | The slash command name (no spaces, e.g. `rules`) |
| **Aliases** | Comma-separated alternate names (optional) |
| **Response** | The text or embed content sent when the command is used |
| **Embed** | Toggle on to send the response as a rich embed |
| **Embed Title** | Title shown at the top of the embed |
| **Embed Color** | Hex color for the embed side bar (default: `#5865F2`) |
| **Delete Invoking** | Delete the user's command message after responding |
| **DM Response** | Send the response in a DM instead of the channel |
| **Cooldown** | Seconds between uses per user (0 = no cooldown) |
| **Required Roles** | Roles a member must have to use this command |

## Managing Commands

From the Commands page you can:

- **Enable / Disable** a command with the toggle switch without deleting it
- **Delete** a command permanently with the trash icon

## Role Permissions

The **Role Permissions** section on the same page lets you control which roles can use any command — built-in or custom. Add a rule by selecting a command name and one or more roles, then choosing **Allow** or **Deny**.

See [Command Permissions](command-permissions.md) for the full permission rule reference.

## Notes

- Custom command names must be unique and cannot conflict with built-in or addon commands.
- The **Message Content Intent** must be enabled on your bot application for custom commands to function.
- Changes take effect immediately — no restart or redeploy needed.
