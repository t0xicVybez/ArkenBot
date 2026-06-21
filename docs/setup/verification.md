# Verification Gate

The Verification Gate holds new members in a restricted "pending" state until they click a verify button. This eliminates bot joins and keeps unverified users out of your main channels.

## Setup

Go to **Verification Gate** in the sidebar (under Moderation).

## Configuration

| Setting | Description |
|---|---|
| **Enable Verification** | Master toggle |
| **Pending Role** | Role assigned to members on join — restrict this role's channel access |
| **Member Role** | Role assigned after a member clicks Verify |
| **Verify Channel** | The channel that contains the verify button panel |

Click **Save** to apply. The bot will post a verify panel embed in the configured channel.

## How It Works

1. Member joins → bot assigns **Pending Role**
2. Member DM'd: "Welcome! Click the button in #verify to continue"
3. Member clicks **Verify** in the verify channel → bot swaps to **Member Role**
4. Member now has full server access

## Channel Permissions Setup

Configure your channels so that **Pending Role** members can only see the verify channel:

- For all other channels: deny **Read Messages** for the Pending Role
- For the verify channel: allow **Read Messages** for the Pending Role (deny Write so they can't chat)
- **Member Role** should have Read Messages in all regular channels

## Notes

- Members without the Pending Role who click the button get a graceful error
- The verify panel can be re-sent by saving the config again
- Works alongside Autorole — set Autorole to assign the Pending Role and skip the Member Role there
