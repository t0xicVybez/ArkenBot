import { EmbedBuilder, type MessageReaction, type PartialMessageReaction, type User, type PartialUser, type TextBasedChannel } from 'discord.js';
import type { AddonContext } from '@arkenbot/addon-sdk';
import { translate, isTranslateAvailable, langName, FLAG_TO_LANG } from '../service.js';

// Debounce: don't re-translate the same message→language within 60s even if
// several people react with the same flag.
const recent = new Map<string, number>();

export async function onFlagReaction(
  ctx: AddonContext,
  reaction: MessageReaction | PartialMessageReaction,
  user: User | PartialUser,
): Promise<void> {
  if (user.bot || !isTranslateAvailable()) return;
  const target = reaction.emoji.name ? FLAG_TO_LANG[reaction.emoji.name] : undefined;
  if (!target) return;

  const guildId = reaction.message.guildId;
  if (!guildId || !(await ctx.isInstalled(guildId))) return;
  const flagReactOn = await ctx.getSetting<boolean>(guildId, 'flagReact', true);
  if (!flagReactOn) return;

  let message = reaction.message;
  try { if (message.partial) message = await message.fetch(); } catch { return; }
  const content = message.content;
  if (!content?.trim()) return;

  const dkey = `${message.id}:${target}`;
  const now = Date.now();
  if ((recent.get(dkey) ?? 0) > now) return;
  recent.set(dkey, now + 60_000);
  if (recent.size > 2000) recent.delete(recent.keys().next().value as string);

  try {
    const { text: out, detected } = await translate(content.slice(0, 1500), target);
    if (!out || detected === target) return;
    const loc = await ctx.resolveLocale({ user: { id: user.id }, guildId, guildLocale: message.guild?.preferredLocale ?? undefined });
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setDescription(out.slice(0, 2000))
      .setFooter({ text: ctx.t('translatedFromTo', loc, { from: langName(detected), to: langName(target) }) });
    const channel = message.channel as TextBasedChannel;
    if (channel && 'send' in channel) {
      await channel.send({ embeds: [embed], reply: { messageReference: message.id, failIfNotExists: false } });
    }
  } catch {
    /* swallow — a failed translation shouldn't spam the channel */
  }
}
