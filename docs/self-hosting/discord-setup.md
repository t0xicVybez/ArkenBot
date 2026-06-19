---
id: self-hosting-discord-setup
sidebar_label: Discord Setup
---

# Discord Setup

## 1. Create the Application

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications) and click **New Application**.
2. Give it a name (e.g. "ArkenBot") and click **Create**.
3. Note the **Application ID** — this is your `DISCORD_CLIENT_ID`.

## 2. Create the Bot

1. In the left sidebar click **Bot**.
2. Under **Token**, click **Reset Token** and copy the value. This is your `DISCORD_TOKEN`. **Store it securely.**
3. Enable the following **Privileged Gateway Intents**:
   - **Server Members Intent** — required for welcome messages, invite tracking, and leveling.
   - **Message Content Intent** — required for AutoMod, counting game, and custom commands.

## 3. OAuth2 Setup

1. In the left sidebar click **OAuth2 → General**.
2. Copy the **Client Secret**. This is your `DISCORD_CLIENT_SECRET`.
3. Under **Redirects**, click **Add Redirect** and enter your callback URL:
   - Local development: `http://localhost:3000/auth/callback`
   - Production: `https://yourdomain.com/auth/callback`
4. This URL is your `DISCORD_REDIRECT_URI`.

## 4. Invite the Bot

1. In the left sidebar click **OAuth2 → URL Generator**.
2. Under **Scopes** select: `bot`, `applications.commands`.
3. Under **Bot Permissions** select at minimum:
   - **Administrator** (simplest for testing)
   - Or fine-grained: Manage Roles, Manage Channels, Kick/Ban Members, Read/Send Messages, Manage Messages, Add Reactions, Embed Links, Attach Files, View Channel.
4. Copy the generated URL and open it in a browser to add the bot to your server.

---

Next: [Installation](installation.md)
