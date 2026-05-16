# Leveling Setup

The leveling system rewards active members with XP, levels, rank cards, and configurable role rewards.

## Enabling Leveling

1. Go to **Settings**
2. Toggle **Leveling** on

## How XP Works

- Members earn XP for every message they send
- There is a **per-user cooldown** between XP gains to prevent spam farming
- XP gained per message = `base XP ± 25% (random)` × `server multiplier`
- The cooldown resets after the configured interval — sending messages faster than the cooldown earns no extra XP

## Dashboard Configuration

Go to **Leveling** in the sidebar.

### XP Multiplier

Set a server-wide multiplier between **0.1×** and **10×**. All XP earned is multiplied by this value. Use it to speed up or slow down leveling for your community.

Use `/leveling multiplier <value>` to change it via command.

### Level Roles

Automatically assign roles when members reach specific levels.

1. Click **Add Level Role**
2. Set the **Level** and select the **Role**
3. Save

When a member reaches that level, they are automatically assigned the role.

**Keep Previous Roles** — Toggle this on to let members keep all their level roles as they climb (stack). Toggle it off to only give the highest earned role (replace).

Use `/leveling sync-roles` to retroactively assign roles to all current members based on their existing levels.

### Level-Up Notifications

Configure where and how level-up messages appear:
- **Level-Up Channel** — Specific channel for level-up pings (leave blank to use the channel the member messaged in)
- **Level-Up Message** — Custom message template (supports `{user}`, `{level}`, `{server}`)
- **Send as Embed** — Send level-up message as a styled embed

The **Level Up** color in General Settings controls the embed accent color.

## Rank Cards

Members can check their rank card with `/rank`. Rank cards show:
- Current level and XP
- Progress bar to next level
- Server rank position
- Message streak (🔥 for 7+ consecutive days)

### Customizing Rank Cards

Members can personalize their own rank card with `/rankcard`:
- `/rankcard color #hex` — Set a custom accent color
- `/rankcard background <url>` — Set a background image (PNG, JPG, or GIF)
- `/rankcard reset` — Reset to default style
- `/rankcard preview` — Preview the current style

## Streaks

Members build a **streak** by sending at least one message each calendar day. The streak counter is shown on the rank card and profile. Missing a day resets the streak to 0.

## Achievements

Members earn achievement badges at various milestones (level thresholds, message counts, streaks). Achievements are displayed on `/profile` and in the achievements embed.

## Leaderboard

Use `/leaderboard` to view the server XP rankings. Pages show 10 members each with medals (🥇🥈🥉) for the top 3.

The dashboard **Leaderboard** page shows the same data with search functionality.
