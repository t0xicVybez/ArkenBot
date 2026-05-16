# Command Permissions

Restrict or allow specific slash commands to certain roles.

## Setup

Go to **Commands** in the sidebar. The **Role Permissions** section is at the bottom of the page.

## How It Works

By default, all commands are available to everyone. Role permissions let you create allow or deny rules for specific commands based on a member's roles.

### Permission Logic

| Scenario | Result |
|---|---|
| No rules set for a command | Everyone can use it |
| Allow rules exist | Member must have **at least one** of the allowed roles |
| Deny rule matches member's role | Member is blocked regardless of allow rules |
| Member is a server administrator | Always bypasses all role rules |

**Deny wins over allow.** If a member has both an allowed role and a denied role for the same command, they are blocked.

## Creating a Permission Rule

1. Select the **Command** from the dropdown
2. Open the **Roles** dropdown and check all roles the rule applies to
3. Choose **Allow** or **Deny**
4. Click **Add**

Multiple roles can be added in a single action — one rule is created per selected role.

## Viewing and Removing Rules

All rules are listed below the form, grouped by command. Each group shows:
- The command name
- Whether it is an **Allow** or **Deny** rule
- Each role as a pill tag with an × to remove it individually

Click × on a role pill to delete that specific rule.

## Applies To

Role permissions apply to all commands: built-in bot commands and commands from installed addons follow the same rules.

## Custom Commands

Custom commands (created in the **Custom Commands** section) have their own per-command role restrictions configured when the command is created. See [Custom Commands](#) in the Commands reference for details.

## Notes

- The `/help` command automatically filters its output based on the invoking user's roles — commands the user cannot access are hidden from the list.
- Bot owners bypass all permission checks.
