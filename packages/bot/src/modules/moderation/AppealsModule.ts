
/**
 * Ban/mute appeals. A punished user clicks "Appeal" (from their DM or the
 * appeal page), fills in a modal explaining their case, and the appeal is
 * posted to a staff channel with approve/deny buttons for review.
 */
import {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  type ButtonInteraction, type ModalSubmitInteraction, type TextChannel,
} from 'discord.js';
import type { BotClient } from '../../client.js';
import { prisma } from '../../database.js';
import { COLORS } from '@arkenbot/shared';
import { swallow } from '../../logger.js';
import { t, resolveUserLocale } from '../../i18n/index.js';

export class AppealsModule {

  static appealButton(guildId: string, type: 'ban' | 'mute', loc: string): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`appeal:start:${guildId}:${type}`).setLabel(t('appeals.appealButton', loc)).setStyle(ButtonStyle.Primary).setEmoji('📝'),
    );
  }

  static async enabled(guildId: string): Promise<boolean> {
    const s = await prisma.guildSettings.findUnique({ where: { guildId }, select: { appealsEnabled: true, appealChannelId: true } });
    return !!(s?.appealsEnabled && s.appealChannelId);
  }

  static async handleStart(interaction: ButtonInteraction): Promise<void> {
    const [, , guildId, type] = interaction.customId.split(':');
    const loc = await resolveUserLocale({ user: interaction.user, guildId, guildLocale: null });
    const existing = await prisma.moderationAppeal.findFirst({ where: { guildId, userId: interaction.user.id, status: 'pending' } });
    if (existing) { await interaction.reply({ content: t('appeals.alreadyPending', loc), ephemeral: true }).catch(() => {}); return; }

    const modal = new ModalBuilder().setCustomId(`appeal:modal:${guildId}:${type}`).setTitle(t('appeals.modalTitle', loc));
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId('reason').setLabel(t('appeals.modalLabel', loc)).setStyle(TextInputStyle.Paragraph).setMaxLength(1000).setRequired(true),
    ));
    await interaction.showModal(modal).catch(() => {});
  }

  static async handleModal(client: BotClient, interaction: ModalSubmitInteraction): Promise<void> {
    const [, , guildId, type] = interaction.customId.split(':');
    const loc = await resolveUserLocale({ user: interaction.user, guildId, guildLocale: null });
    const reason = interaction.fields.getTextInputValue('reason').trim();
    const result = await this.submitAppeal(client, { guildId, userId: interaction.user.id, userTag: interaction.user.tag, type, reason });
    const msg = result === 'disabled' ? t('appeals.disabled', loc) : result === 'duplicate' ? t('appeals.alreadyPending', loc) : t('appeals.submitted', loc);
    await interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
  }

  static async submitAppeal(
    client: BotClient,
    input: { guildId: string; userId: string; userTag: string; type: string; reason: string },
  ): Promise<'ok' | 'disabled' | 'duplicate'> {
    const { guildId, userId, userTag } = input;
    const type = input.type === 'mute' ? 'mute' : 'ban';
    const settings = await prisma.guildSettings.findUnique({ where: { guildId }, select: { appealsEnabled: true, appealChannelId: true } });
    if (!settings?.appealsEnabled || !settings.appealChannelId) return 'disabled';
    const dup = await prisma.moderationAppeal.findFirst({ where: { guildId, userId, status: 'pending' } });
    if (dup) return 'duplicate';
    const appeal = await prisma.moderationAppeal.create({ data: { guildId, userId, userTag, type, reason: input.reason.slice(0, 1000) } });
    await this.postForReview(client, appeal.id).catch(swallow);
    return 'ok';
  }

  static async postForReview(client: BotClient, appealId: string): Promise<void> {
    const appeal = await prisma.moderationAppeal.findUnique({ where: { id: appealId } });
    if (!appeal || appeal.status !== 'pending') return;
    const settings = await prisma.guildSettings.findUnique({ where: { guildId: appeal.guildId }, select: { appealChannelId: true } });
    const guild = client.guilds.cache.get(appeal.guildId);
    const channel = settings?.appealChannelId ? guild?.channels.cache.get(settings.appealChannelId) : undefined;
    if (!guild || !channel?.isTextBased()) return;
    const staffLoc = await resolveUserLocale({ user: { id: '' }, guildId: appeal.guildId, guildLocale: guild.preferredLocale });
    const user = await client.users.fetch(appeal.userId).catch(() => null);
    const embed = new EmbedBuilder().setColor(COLORS.WARNING)
      .setAuthor({ name: appeal.userTag, iconURL: user?.displayAvatarURL() })
      .setTitle(t('appeals.reviewTitle', staffLoc, { type: t(`appeals.type.${appeal.type}`, staffLoc) }))
      .setDescription(appeal.reason)
      .addFields({ name: t('appeals.userField', staffLoc), value: `<@${appeal.userId}> (${appeal.userId})` })
      .setFooter({ text: `appeal:${appeal.id}` }).setTimestamp();
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`appeal:approve:${appeal.id}`).setLabel(t('appeals.approve', staffLoc)).setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`appeal:deny:${appeal.id}`).setLabel(t('appeals.deny', staffLoc)).setStyle(ButtonStyle.Danger),
    );
    await (channel as TextChannel).send({ embeds: [embed], components: [row] }).catch(swallow);
  }

  static async applyDecision(client: BotClient, appeal: { id: string; guildId: string; userId: string; type: string }, approved: boolean, reviewerTag = 'staff'): Promise<string> {
    const guild = client.guilds.cache.get(appeal.guildId);
    const staffLoc = await resolveUserLocale({ user: { id: '' }, guildId: appeal.guildId, guildLocale: guild?.preferredLocale ?? null });
    let reversalNote = '';
    if (approved && guild) {
      if (appeal.type === 'ban') {
        const ok = await guild.bans.remove(appeal.userId, `Appeal approved by ${reviewerTag}`).then(() => true).catch(() => false);
        reversalNote = ok ? t('appeals.unbanned', staffLoc) : t('appeals.unbanFailed', staffLoc);
      } else {
        const member = await guild.members.fetch(appeal.userId).catch(() => null);
        const ok = member ? await member.timeout(null, `Appeal approved by ${reviewerTag}`).then(() => true).catch(() => false) : false;
        reversalNote = ok ? t('appeals.unmuted', staffLoc) : t('appeals.unmuteFailed', staffLoc);
      }
    }
    const user = await client.users.fetch(appeal.userId).catch(() => null);
    if (user && guild) {
      const userLoc = await resolveUserLocale({ user: { id: user.id }, guildId: guild.id, guildLocale: guild.preferredLocale });
      const embed = new EmbedBuilder().setColor(approved ? COLORS.SUCCESS : COLORS.ERROR)
        .setTitle(t(approved ? 'appeals.approvedTitle' : 'appeals.deniedTitle', userLoc, { server: guild.name }))
        .setDescription(t(approved ? 'appeals.approvedDesc' : 'appeals.deniedDesc', userLoc, { server: guild.name }));
      await user.send({ embeds: [embed] }).catch(swallow);
    }
    return reversalNote;
  }

  static async handleReview(client: BotClient, interaction: ButtonInteraction): Promise<void> {
    const [, action, appealId] = interaction.customId.split(':');
    const staffLoc = await resolveUserLocale({ user: interaction.user, guildId: interaction.guildId, guildLocale: interaction.guild?.preferredLocale ?? null });
    const approved = action === 'approve';

    const claimed = await prisma.moderationAppeal.updateMany({
      where: { id: appealId, status: 'pending' },
      data: { status: approved ? 'approved' : 'denied', reviewedBy: interaction.user.id, reviewedAt: new Date() },
    });
    const appeal = await prisma.moderationAppeal.findUnique({ where: { id: appealId } });
    if (!appeal) { await interaction.reply({ content: t('appeals.gone', staffLoc), ephemeral: true }).catch(() => {}); return; }
    if (claimed.count === 0) { await interaction.reply({ content: t('appeals.handled', staffLoc), ephemeral: true }).catch(() => {}); return; }

    const reversalNote = await this.applyDecision(client, appeal, approved, interaction.user.tag);
    const original = interaction.message.embeds[0];
    const updated = EmbedBuilder.from(original).setColor(approved ? COLORS.SUCCESS : COLORS.ERROR)
      .addFields({ name: t('appeals.decision', staffLoc), value: `${approved ? '✅' : '❌'} ${t(approved ? 'appeals.approvedBy' : 'appeals.deniedBy', staffLoc, { user: `<@${interaction.user.id}>` })}${reversalNote ? ` · ${reversalNote}` : ''}` });
    await interaction.update({ embeds: [updated], components: [] }).catch(() => {});
  }
}
