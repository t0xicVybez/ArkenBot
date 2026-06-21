---
sidebar_label: Temp Voice Channels
---

# Temporary Voice Channels

ArkenBot can automatically create and delete personal voice channels on demand using a **Create-to-Join** trigger channel.

## Setup

1. Go to **Dashboard → Temp Voice** (under Tools in the sidebar)
2. Pick an existing voice channel to use as the **trigger channel** — members join this channel to create their own
3. Click **Save**

Name your trigger channel something obvious, like `➕ Create Channel` or `🎙 Join to Create`.

> The bot needs **Manage Channels** and **Move Members** permissions in your server.

## How It Works

1. A member joins the trigger channel
2. The bot instantly creates a new voice channel named **`{Member}'s Channel`** in the same category
3. The member is moved into their new channel automatically
4. When the channel becomes **empty**, the bot deletes it automatically

## Owner Permissions

The member who triggered the channel creation becomes its **owner** and receives:
- **Manage Channel** — rename it, set a user limit, adjust permissions
- **Move Members** — drag other members in or out

Everyone else in the server can view and join the channel by default.

## Disabling

To disable Create-to-Join, go back to **Dashboard → Temp Voice** and click **Disable**.

## Tips

- Place the trigger channel at the top of a voice category so it's easy to find
- Members can rename their channel via Discord's native channel settings (right-click → Edit Channel)
- Channels are deleted as soon as the last person leaves — they are never left orphaned
