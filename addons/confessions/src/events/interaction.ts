/**
 * Confessions interaction routing:
 *  - Modal submit `confess:submit`         — a member's anonymous submission
 *  - Button `confess:approve:<recordId>`   — staff approves a pending confession
 *  - Button `confess:deny:<recordId>`      — staff rejects a pending confession
 *
 * The submitter's identity is stored on the record for staff accountability
 * (`/confess-setup whois`) but never appears in any posted message.
 */
import {
  PermissionFlagsBits,
  MessageFlags,
  ChannelType,
  type Interaction,
  type GuildTextBasedChannel,
} from 'discord.js';
import type { AddonContext } from '@arkenbot/addon-sdk';
import { getConfig, nextNumber, saveRecord, findRecord, generateId } from '../utils/storage.js';
import { cooldownRemaining, markUsed } from '../utils/cooldown.js';
import { buildPublicEmbed, buildReviewEmbed, buildReviewButtons } from '../utils/embeds.js';
import type { ConfessionRecord } from '../types.js';

type T = (key: string, vars?: Record<string, string | number>) => string;

async function postPublic(interaction: Interaction, config: { channelId?: string; allowReplies: boolean }, record: ConfessionRecord, t: T): Promise<string | null> {
  if (!config.channelId) return null;
  const channel = interaction.guild?.channels.cache.get(config.channelId);
  if (!channel || channel.type !== ChannelType.GuildText) return null;
  const msg = await (channel as GuildTextBasedChannel).send({ embeds: [buildPublicEmbed(record, t)] }).catch(() => null);
  if (msg && config.allowReplies) {
    await msg.startThread({ name: t('threadName', { number: record.number }) }).catch(() => undefined);
  }
  return msg?.id ?? null;
}

export const interactionHandler = {
  async handle(ctx: AddonContext, interaction: Interaction): Promise<void> {
    if (!interaction.guildId || !interaction.guild) return;
    const guildId = interaction.guildId;

    // ─── Member submits a confession ──────────────────────────────────────────
    if (interaction.isModalSubmit() && interaction.customId === 'confess:submit') {
      const loc = await ctx.resolveLocale(interaction);
      const guildLoc = await ctx.resolveLocale({ user: { id: '' }, guildId, guildLocale: interaction.guild.preferredLocale });
      const t = (k: string, v?: Record<string, string | number>) => ctx.t(k, loc, v);
      const gt = (k: string, v?: Record<string, string | number>) => ctx.t(k, guildLoc, v);

      const config = await getConfig(ctx.storage, guildId);
      if (!config.channelId) { await interaction.reply({ content: t('notConfigured'), flags: MessageFlags.Ephemeral }); return; }
      if (config.blocked.includes(interaction.user.id)) { await interaction.reply({ content: t('blocked'), flags: MessageFlags.Ephemeral }); return; }
      const wait = cooldownRemaining(guildId, interaction.user.id, config.cooldownSec);
      if (wait > 0) { await interaction.reply({ content: t('cooldown', { seconds: wait }), flags: MessageFlags.Ephemeral }); return; }

      const content = (interaction.fields.getTextInputValue('content') || '').trim();
      if (!content) { await interaction.reply({ content: t('empty'), flags: MessageFlags.Ephemeral }); return; }

      const { number } = await nextNumber(ctx.storage, guildId);
      markUsed(guildId, interaction.user.id);

      const record: ConfessionRecord = {
        id: generateId(),
        number,
        userId: interaction.user.id,
        content,
        status: config.reviewChannelId ? 'pending' : 'posted',
        createdAt: new Date().toISOString(),
      };

      if (config.reviewChannelId) {
        const review = interaction.guild.channels.cache.get(config.reviewChannelId);
        if (review && review.type === ChannelType.GuildText) {
          const msg = await (review as GuildTextBasedChannel).send({
            embeds: [buildReviewEmbed(record, gt)],
            components: [buildReviewButtons(record.id, gt)],
          }).catch(() => null);
          if (msg) record.reviewMessageId = msg.id;
        }
        await saveRecord(ctx.storage, guildId, record);
        await interaction.reply({ content: t('submittedReview', { number }), flags: MessageFlags.Ephemeral });
      } else {
        record.publicMessageId = (await postPublic(interaction, config, record, gt)) ?? undefined;
        await saveRecord(ctx.storage, guildId, record);
        await interaction.reply({ content: t('posted', { number }), flags: MessageFlags.Ephemeral });
      }
      return;
    }

    // ─── Staff approve / deny ─────────────────────────────────────────────────
    if (interaction.isButton() && (interaction.customId.startsWith('confess:approve:') || interaction.customId.startsWith('confess:deny:'))) {
      const loc = await ctx.resolveLocale(interaction);
      const guildLoc = await ctx.resolveLocale({ user: { id: '' }, guildId, guildLocale: interaction.guild.preferredLocale });
      const t = (k: string, v?: Record<string, string | number>) => ctx.t(k, loc, v);
      const gt = (k: string, v?: Record<string, string | number>) => ctx.t(k, guildLoc, v);

      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
        await interaction.reply({ content: t('needStaff'), flags: MessageFlags.Ephemeral });
        return;
      }

      const [, action, recordId] = interaction.customId.split(':');
      const config = await getConfig(ctx.storage, guildId);
      const record = await findRecord(ctx.storage, guildId, recordId);
      if (!record) { await interaction.reply({ content: t('recordGone'), flags: MessageFlags.Ephemeral }); return; }
      if (record.status !== 'pending') { await interaction.reply({ content: t('alreadyHandled'), flags: MessageFlags.Ephemeral }); return; }

      if (action === 'approve') {
        record.status = 'posted';
        record.publicMessageId = (await postPublic(interaction, config, record, gt)) ?? undefined;
        await saveRecord(ctx.storage, guildId, record);
        await interaction.update({ content: t('approvedNote', { user: `<@${interaction.user.id}>` }), embeds: interaction.message.embeds, components: [] }).catch(() => undefined);
      } else {
        record.status = 'denied';
        await saveRecord(ctx.storage, guildId, record);
        await interaction.update({ content: t('deniedNote', { user: `<@${interaction.user.id}>` }), embeds: interaction.message.embeds, components: [] }).catch(() => undefined);
      }
      return;
    }
  },
};
