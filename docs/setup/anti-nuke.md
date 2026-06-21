# Anti-Nuke Protection

Anti-Nuke monitors for rapid destructive actions — mass channel deletions, mass role deletions, and mass bans — and automatically neutralises the offending account before significant damage occurs.

## Setup

Go to **Anti-Nuke** in the sidebar (under Moderation).

## Configuration

| Setting | Default | Description |
|---|---|---|
| **Enable Anti-Nuke** | Off | Master toggle |
| **Channel Delete Threshold** | 3 | Deletions within 60 s that trigger action |
| **Role Delete Threshold** | 3 | Role deletions within 60 s that trigger action |
| **Mass Ban Threshold** | 5 | Bans within 60 s that trigger action |
| **Action on Trigger** | De-op | What happens to the offender |
| **Alert Channel** | None | Channel to receive an alert embed when action is taken |

### Actions

| Action | What it does |
|---|---|
| **De-op** | Removes all roles from the offender immediately |
| **Kick** | Removes all roles then kicks the offender |
| **Ban** | Removes all roles then bans the offender |

The bot checks Discord audit logs to identify who performed each action.

## How It Works

1. Every channel delete, role delete, or ban is recorded in a 60-second rolling window per user
2. When a user's count hits the configured threshold, the selected action is taken immediately
3. An embed is posted to the alert channel (if configured) listing what triggered the response

## Notes

- The bot must have **Administrator** or the explicit **Manage Channels / Manage Roles / Ban Members** permissions
- The bot's role must be **higher** than the offender's highest role for De-op or Kick to succeed
- Admins are notified via DM when action is taken (members with Administrator permission in the server)
