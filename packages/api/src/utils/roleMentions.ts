/**
 * Utility for resolving human-readable @role-name mentions in notification
 * message strings into Discord's `<@&roleId>` mention format.
 */
import axios from 'axios';

const DISCORD_API = 'https://discord.com/api/v10';

/**
 * Replaces `@RoleName` occurrences in `message` with the corresponding Discord
 * role mention syntax (`<@&roleId>`). Roles are matched longest-first to avoid
 * partial substitutions where one role name is a prefix of another.
 *
 * Returns `message` unchanged if it contains no `@` character, if
 * `DISCORD_TOKEN` is not set, or if the Discord API request fails.
 *
 * @param guildId - The Discord guild whose roles are fetched.
 * @param message - The message string to process.
 */
export async function resolveRoleMentions(guildId: string, message?: string): Promise<string | undefined> {
  if (!message || !message.includes('@')) return message;
  if (!process.env.DISCORD_TOKEN) return message;

  try {
    const res = await axios.get(`${DISCORD_API}/guilds/${guildId}/roles`, {
      headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` },
    });

    const roles = Array.isArray(res.data) ? res.data : [];
    // Sort longest-name-first so that a role named "Admin Team" is matched
    // before a role named "Admin" when both appear in the message.
    const roleCandidates = roles
      .filter((role: any) => typeof role.name === 'string' && role.name.trim().length > 0)
      .sort((a: any, b: any) => b.name.length - a.name.length);

    let updatedMessage = message;
    for (const role of roleCandidates) {
      const roleName = role.name.trim();
      const escapedRoleName = roleName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const roleRegex = new RegExp(`(^|\\s)@${escapedRoleName}(?=\\s|$|[.,!?;:\\)\\]\\}])`, 'gi');
      updatedMessage = updatedMessage.replace(roleRegex, `$1<@&${role.id}>`);
    }

    return updatedMessage;
  } catch {
    return message;
  }
}
