# Inviting ArkenBot

Add ArkenBot to your Discord server.

## Invite Link

Use the **Add to Server** button on the ArkenBot website or landing page. This generates an invite link with the required permissions pre-selected.

The invite URL includes:
- `scope=bot+applications.commands` — Required for slash commands
- `permissions=8824675416665207` — All permissions ArkenBot needs (see below)

## Required Permissions

ArkenBot requests the following permissions:

| Permission | Why It's Needed |
|---|---|
| **Manage Roles** | Assign level roles, birthday roles, auto-roles |
| **Manage Channels** | Auto-slowmode, stats channels |
| **Kick Members** | Moderation kick command |
| **Ban Members** | Moderation ban/unban commands |
| **Manage Messages** | Purge command, auto-mod message deletion |
| **Read Message History** | Bulk message deletion (purge) |
| **Send Messages** | All bot responses and embeds |
| **Embed Links** | Rich embed messages |
| **Attach Files** | Rank card images, transcripts |
| **Add Reactions** | Reaction role panels, giveaway entries, polls |
| **Moderate Members** | Discord timeout (mute) command |
| **Manage Guild** | Invite tracker, guild information |
| **View Channels** | Required to see and interact with channels |

## After Inviting

1. Open the **ArkenBot Dashboard**
2. Select your server
3. Follow the [Quick Start](quick-start.md) guide to configure the features you want

## Troubleshooting

**The bot is online but commands don't appear**
Slash commands can take up to an hour to propagate globally. Try using the commands in a DM or re-inviting the bot.

**The bot can't assign a role**
The bot's role must be **above** the target role in your server's role hierarchy (Server Settings → Roles).

**The bot says it's missing permissions**
Ensure the channel hasn't overridden the bot's permissions. Check channel settings → Permissions and verify the bot or its role isn't denied the needed permissions.
