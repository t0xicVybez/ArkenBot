/**
 * Embed factories for a consistent look across the bot.
 *
 * Instead of building an EmbedBuilder by hand each time, commands use these so
 * every success/error/warning/info message shares the same colour and icon.
 */
import { EmbedBuilder, type ColorResolvable } from 'discord.js';
import { COLORS } from '@arkenbot/shared';

export function successEmbed(title: string, description?: string): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(COLORS.SUCCESS as ColorResolvable)
    .setTitle(`✅ ${title}`);
  if (description) embed.setDescription(description);
  return embed;
}

export function errorEmbed(title: string, description?: string): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(COLORS.ERROR as ColorResolvable)
    .setTitle(`❌ ${title}`);
  if (description) embed.setDescription(description);
  return embed;
}

export function warningEmbed(title: string, description?: string): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(COLORS.WARNING as ColorResolvable)
    .setTitle(`⚠️ ${title}`);
  if (description) embed.setDescription(description);
  return embed;
}

export function infoEmbed(title: string, description?: string): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(COLORS.INFO as ColorResolvable)
    .setTitle(`ℹ️ ${title}`);
  if (description) embed.setDescription(description);
  return embed;
}

/**
 * A structured embed for moderation actions (ban, kick, mute, …) with the
 * standard User / Moderator / Reason fields, plus optional duration and case
 * number. Pass `colorHex` to override the default moderation colour.
 */
export function moderationEmbed(
  options: {
    action: string;
    user: string;
    moderator: string;
    reason: string;
    duration?: string;
    caseNumber?: number;
  },
  colorHex?: string,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor((colorHex ?? COLORS.MODERATION) as ColorResolvable)
    .setTitle(`🔨 ${options.action}`)
    .addFields(
      { name: 'User', value: options.user, inline: true },
      { name: 'Moderator', value: options.moderator, inline: true },
      { name: 'Reason', value: options.reason },
    )
    .setTimestamp();

  if (options.duration) {
    embed.addFields({ name: 'Duration', value: options.duration, inline: true });
  }
  if (options.caseNumber) {
    embed.setFooter({ text: `Case #${options.caseNumber}` });
  }

  return embed;
}
