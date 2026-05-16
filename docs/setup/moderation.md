# Moderation Setup

ArkenBot's moderation system tracks every action as a numbered **case**, giving you a full audit trail for every member.

## Enabling Moderation

1. Go to **Settings**
2. Toggle **Moderation** on

## Configuring Log Channels

Go to **Logs** and set:
- **Mod Log Channel** — Where ban/kick/warn/mute embeds are posted
- **Log Channel** — Where message edits, deletes, and member events are posted

## How Cases Work

Every moderation action creates a case with:
- A sequential **case number** (per guild)
- The **action type** (ban, kick, mute, warn, unban, etc.)
- The **target user**
- The **moderator** who performed the action
- A **reason** (required for warns, optional for others)
- A **timestamp**

Look up any case with `/case <number>`.

## Moderation Commands

See the full [Moderation Commands](../commands/moderation.md) reference.

## Temporary Bans

The `/ban` command supports an optional `duration` parameter (e.g. `1d`, `12h`, `30m`). Temporary bans are automatically lifted when they expire — no manual action needed.

## DMs on Action

When you ban, kick, mute, or warn a member, the bot sends them a DM explaining what happened and the reason (if provided). The DM is sent before the action so the user receives it even if banned.

## Auto-Mod Integration

The [Auto-Mod](automod.md) system creates moderation cases automatically for automated actions, keeping everything in one unified case history.
