# Report System

The Report System lets members report other users directly through a slash command. Reports are sent to a private staff channel and can be reviewed and dismissed from the dashboard.

## Setup

Go to **Reports** in the sidebar (under Moderation).

1. Set the **Report Channel** (the channel where report embeds will be sent — visible to staff only)
2. Click **Save**

Or use the command: `/report-setup channel:#staff-reports`

## How Reports Work

### Submitting a Report

Any member can run:
```
/report user:@Username reason:Spamming invite links in DMs
```

The command is ephemeral — only the reporter sees the confirmation. The bot posts a report embed to the configured staff channel with Accept and Dismiss buttons.

### Reviewing Reports

**From Discord:** Staff click **Action Taken** or **Dismiss** buttons directly on the embed. Action Taken prompts for a staff note before closing the report.

**From the Dashboard:** Go to **Reports** → **Pending** tab. Click **Mark Reviewed** or **Dismiss** on any report.

### Report Statuses

| Status | Meaning |
|---|---|
| **Pending** | Awaiting staff review |
| **Reviewed** | Staff took action (note may be attached) |
| **Dismissed** | Report closed without action |

## Notes

- `/report` is available to all members — no special permissions required
- A report channel must be configured for reports to be posted
- The dashboard shows all reports regardless of whether a channel is set
