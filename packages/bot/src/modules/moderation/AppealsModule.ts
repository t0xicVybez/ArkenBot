/**
 * AppealsModule — ban/mute appeal flow.
 *
 * Flow: on a ban/mute the offender is DM'd an "Appeal" button. Clicking opens a
 * modal; submitting posts the appeal to a staff review channel with Approve /
 * Deny buttons. Approving reverses the action (unban / remove timeout) and DMs
 * the user; denying just records and DMs the outcome. Works from DMs, so a
 * banned user (no longer in the guild) can still appeal.
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
  /** A button attached to a ban/mute DM so the user can appeal. */
  static appealButton(guildId: string, type: 'ban' | 'mute', loc: string): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`appeal:start:${guildId}:${type}`).setLabel(t('appeals.appealButton', loc)).setStyle(ButtonStyle.Primary).setEmoji('📝'),
    );
  }

  /** Whether appeals are enabled for a guild (used before attaching the button). */
  static async enabled(guildId: string): Promise<boolean> {
    const s = await prisma.guildSettings.findUnique({ where: { guildId }, select: { appealsEnabled: true, appealChannelId: true } });
    return !!(s?.appealsEnabled && s.appealChannelId);
  }

  /** `appeal:start:<guildId>:<type>` — open the appeal modal. */
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

  /** `appeal:modal:<guildId>:<type>` — record the appeal and post it for review. */
  static async handleModal(client: BotClient, interaction: ModalSubmitInteraction): Promise<void> {
    const [, , guildId, type] = interaction.customId.split(':');
    const loc = await resolveUserLocale({ user: interaction.user, guildId, guildLocale: null });
    const reason = interaction.fields.getTextInputValue('reason').trim();

    const settings = await prisma.guildSettings.findUnique({ where: { guildId }, select: { appealsEnabled: true, appealChannelId: true } });
    if (!settings?.appealsEnabled || !settings.appealChannelId) { await interaction.reply({ content: t('appeals.disabled', loc), ephemeral: true }).catch(() => {}); return; }
    const dup = await prisma.moderationAppeal.findFirst({ where: { guildId, userId: interaction.user.id, status: 'pending' } });
    if (dup) { await interaction.reply({ content: t('appeals.alreadyPending', loc), ephemeral: true }).catch(() => {}); return; }

    const appeal = await prisma.moderationAppeal.create({ data: { guildId, userId: interaction.user.id, userTag: interaction.user.tag, type: type === 'mute' ? 'mute' : 'ban', reason } });

    const guild = client.guilds.cache.get(guildId);
    const channel = guild?.channels.cache.get(settings.appealChannelId);
    if (guild && channel?.isTextBased()) {
      const staffLoc = await resolveUserLocale({ user: { id: '' }, guildId, guildLocale: guild.preferredLocale });
      const embed = new EmbedBuilder().setColor(COLORS.WARNING)
        .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() })
        .setTitle(t('appeals.reviewTitle', staffLoc, { type: t(`appeals.type.${appeal.type}`, staffLoc) }))
        .setDescription(reason)
        .addFields({ name: t('appeals.userField', staffLoc), value: `<@${interaction.user.id}> (${interaction.user.id})` })
        .setFooter({ text: `appeal:${appeal.id}` }).setTimestamp();
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`appeal:approve:${appeal.id}`).setLabel(t('appeals.approve', staffLoc)).setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`appeal:deny:${appeal.id}`).setLabel(t('appeals.deny', staffLoc)).setStyle(ButtonStyle.Danger),
      );
      await (channel as TextChannel).send({ embeds: [embed], components: [row] }).catch(swallow);
    }
    await interaction.reply({ content: t('appeals.submitted', loc), ephemeral: true }).catch(() => {});
  }

  /** `appeal:approve|deny:<appealId>` — staff decision; reverses the action on approve. */
  static async handleReview(client: BotClient, interaction: ButtonInteraction): Promise<void> {
    const [, action, appealId] = interaction.customId.split(':');
    const staffLoc = await resolveUserLocale({ user: interaction.user, guildId: interaction.guildId, guildLocale: interaction.guild?.preferredLocale ?? null });
    const appeal = await prisma.moderationAppeal.findUnique({ where: { id: appealId } });
    if (!appeal) { await interaction.reply({ content: t('appeals.gone', staffLoc), ephemeral: true }).catch(() => {}); return; }
    if (appeal.status !== 'pending') { await interaction.reply({ content: t('appeals.handled', staffLoc), ephemeral: true }).catch(() => {}); return; }

    const approved = action === 'approve';
    await prisma.moderationAppeal.update({ where: { id: appealId }, data: { status: approved ? 'approved' : 'denied', reviewedBy: interaction.user.id, reviewedAt: new Date() } });

    const guild = client.guilds.cache.get(appeal.guildId);
    let reversalNote = '';
    if (approved && guild) {
      if (appeal.type === 'ban') {
        const ok = await guild.bans.remove(appeal.userId, `Appeal approved by ${interaction.user.tag}`).then(() => true).catch(() => false);
        reversalNote = ok ? t('appeals.unbanned', staffLoc) : t('appeals.unbanFailed', staffLoc);
      } else {
        const member = await guild.members.fetch(appeal.userId).catch(() => null);
        const ok = member ? await member.timeout(null, `Appeal approved by ${interaction.user.tag}`).then(() => true).catch(() => false) : false;
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

    const original = interaction.message.embeds[0];
    const updated = EmbedBuilder.from(original).setColor(approved ? COLORS.SUCCESS : COLORS.ERROR)
      .addFields({ name: t('appeals.decision', staffLoc), value: `${approved ? '✅' : '❌'} ${t(approved ? 'appeals.approvedBy' : 'appeals.deniedBy', staffLoc, { user: `<@${interaction.user.id}>` })}${reversalNote ? ` · ${reversalNote}` : ''}` });
    await interaction.update({ embeds: [updated], components: [] }).catch(() => {});
  }
}
