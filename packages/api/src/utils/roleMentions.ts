/**
 * Turns @role-name text in a message into real Discord role mentions by matching against the guild's roles.
 */
import axios from 'axios';
import { isSnowflake } from '@arkenbot/shared';

const DISCORD_API = 'https://discord.com/api/v10';

export async function resolveRoleMentions(guildId: string, message?: string): Promise<string | undefined> {
  if (!message || !message.includes('@')) return message;
  if (!process.env.DISCORD_TOKEN) return message;
  // Defence-in-depth: guildId is interpolated into the Discord API URL below, so
  // reject anything that isn't a plain snowflake (prevents request-forgery via a
  // crafted id that appends path segments).
  if (!isSnowflake(guildId)) return message;

  try {
    const res = await axios.get(`${DISCORD_API}/guilds/${guildId}/roles`, {
      headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` },
    });

    const roles: Array<{ id: string; name: string }> = Array.isArray(res.data) ? res.data : [];

    const roleCandidates = roles
      .filter((role) => typeof role.name === 'string' && role.name.trim().length > 0)
      .sort((a, b) => b.name.length - a.name.length);

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
