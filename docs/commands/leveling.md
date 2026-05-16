# Leveling Commands

Commands for the XP and leveling system. Members use rank and leaderboard commands freely. Admin commands require elevated permissions.

---

## /rank

Check your rank card or view another member's.

| Option | Required | Description |
|---|---|---|
| `user` | No | The member to check (defaults to yourself) |

Shows current level, XP, progress to next level, server rank position, and message streak.

---

## /profile

View a member's full profile: level, XP, stats, and earned achievements.

| Option | Required | Description |
|---|---|---|
| `user` | No | Member to view (defaults to yourself) |

---

## /rankcard

Personalise your own rank card appearance.

### Subcommands

| Subcommand | Description |
|---|---|
| `color <hex>` | Set a custom accent color (e.g. `#ff5733`) |
| `background <url>` | Set a custom background image (PNG, JPG, or GIF URL) |
| `reset` | Reset your rank card to the default style |
| `preview` | Preview your current rank card without sharing it |

---

## /leaderboard

View the server XP rankings.

| Option | Required | Description |
|---|---|---|
| `page` | No | Page number (10 members per page, default: page 1) |

Top 3 members get medal emojis (🥇🥈🥉).

---

## /stats

View detailed engagement stats for a member (message count, streak, days active, etc.).

| Option | Required | Description |
|---|---|---|
| `user` | No | Member to check (defaults to yourself) |

---

## /leveling

Admin commands for managing the leveling system.

**Required permission:** Manage Guild (implied by bot owner / admin configuration)

### Subcommands

| Subcommand | Description |
|---|---|
| `multiplier <value>` | Set the server XP multiplier (0.1–10.0). Use `2.0` for double XP. |
| `sync-roles` | Retroactively assign level roles to all members based on their current level |
| `keep-roles <enabled>` | `true` = stack all earned level roles; `false` = only keep the highest |

---

## /givexp

Give XP directly to a member (admin command).

| Option | Required | Description |
|---|---|---|
| `user` | Yes | The member to give XP to |
| `amount` | Yes | Amount of XP to give (1–1,000,000) |

---

## /removexp

Remove XP from a member (admin command).

| Option | Required | Description |
|---|---|---|
| `user` | Yes | The member to remove XP from |
| `amount` | Yes | Amount of XP to remove (1–1,000,000) |

---

## /resetxp

Reset all XP and levels for the entire server. **This cannot be undone.**

| Option | Required | Description |
|---|---|---|
| `confirm` | Yes | Must be `true` to proceed |
