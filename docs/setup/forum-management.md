# Forum Post Management

Forum Post Management automatically applies tags and sends a template message when a new thread is created in a configured forum channel.

## Setup

Go to **Forum Management** in the sidebar (under Tools).

## Adding a Forum Channel

1. Click **Add Forum Channel**
2. Select the forum channel from the dropdown
3. (Optional) Set a **Template Message** — sent as the first bot reply in every new thread
4. (Optional) Set an **Auto-Tag ID** — the tag is applied to new threads automatically
5. Click **Save**

## Finding Tag IDs

Discord doesn't display tag IDs in the UI. To find a tag ID:
1. Enable Developer Mode in Discord → Settings → Advanced
2. Right-click a tag in the forum channel → **Copy Tag ID**

## Configuration Per Channel

Each configured forum channel can have:
- **Template Message** — a welcome/instructions post sent to every new thread
- **Auto-Tag ID** — automatically applies one tag on thread creation

## Slash Commands

| Command | Description |
|---|---|
| `/forum-setup set-template channel:#forum message:text` | Sets the template message |
| `/forum-setup set-auto-tag channel:#forum tag-id:123456` | Sets the auto-apply tag |
| `/forum-setup clear channel:#forum` | Removes all config for a channel |

## Notes

- Template messages are sent by the bot account — make sure the bot has **Send Messages in Threads** permission in the forum channel
- Only **Forum Channel** types are supported — regular text channels are ignored
- Removing a config does not affect existing threads
