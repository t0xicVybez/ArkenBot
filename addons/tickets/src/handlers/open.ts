/**
 * Open handling for the tickets addon.
 */
import {
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  type ButtonInteraction,
  type StringSelectMenuInteraction,
  type ModalSubmitInteraction,
  type Guild,
  type TextChannel,
} from 'discord.js';
import { randomUUID } from 'crypto';
import { isLLMAvailable } from '@arkenbot/shared';
import type { AddonContext } from '@arkenbot/addon-sdk';
import type { Ticket, TicketPriority, TicketPanel } from '../types.js';
import {
  getPanel,
  getConfig,
  getUserOpenTickets,
  getTickets,
  nextTicketNumber,
  saveTicket,
  saveConfig,
} from '../utils/storage.js';
import { resolvePanelFields } from '../utils/fields.js';
import { buildTicketEmbed, buildTicketControls } from '../utils/embeds.js';
import { createTicketChannel, resolveChannelName } from '../utils/channel.js';
import { isWithinBusinessHours } from '../utils/time.js';
import { fireWebhook } from '../utils/webhook.js';
import { runTriageModel, getUserTicketHistory, sendAssignmentBrief } from './triage.js';

export async function handleOpenTicket(
  ctx: AddonContext,
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  panelId: string,
  buttonId?: string,
): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId || !interaction.guild) return;
  const loc = await ctx.resolveLocale(interaction);
  const t = (k: string, v?: Record<string, string | number>) => ctx.t(k, loc, v);

  const panel = await getPanel(ctx.storage, guildId, panelId);
  if (!panel || !panel.enabled) {
    await interaction.reply({ content: t('panelNotAvailable'), flags: MessageFlags.Ephemeral });
    return;
  }

  const config = await getConfig(ctx.storage, guildId);
  if (config.blacklistedUsers.includes(interaction.user.id)) {
    await interaction.reply({
      content: t('notAllowedOpen'),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (config.minAccountAgeDays && config.minAccountAgeDays > 0) {
    const ageMs = Date.now() - interaction.user.createdTimestamp;
    if (ageMs < config.minAccountAgeDays * 86400000) {
      await interaction.reply({ content: t('accountTooNew', { days: config.minAccountAgeDays }), flags: MessageFlags.Ephemeral });
      return;
    }
  }

  if (config.requiredOpenRoleId) {
    const m = interaction.guild.members.cache.get(interaction.user.id)
      ?? (await interaction.guild.members.fetch(interaction.user.id).catch(() => null));
    if (!m?.roles.cache.has(config.requiredOpenRoleId)) {
      await interaction.reply({ content: t('needRoleToOpen', { role: `<@&${config.requiredOpenRoleId}>` }), flags: MessageFlags.Ephemeral });
      return;
    }
  }

  if (config.openCooldownMinutes && config.openCooldownMinutes > 0) {
    const mine = (await getTickets(ctx.storage, guildId))
      .filter((x) => x.userId === interaction.user.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const last = mine[0];
    if (last) {
      const cdMs = config.openCooldownMinutes * 60000;
      const sinceMs = Date.now() - new Date(last.createdAt).getTime();
      if (sinceMs < cdMs) {
        const readyAt = Math.floor((new Date(last.createdAt).getTime() + cdMs) / 1000);
        await interaction.reply({ content: t('openCooldown', { when: `<t:${readyAt}:R>` }), flags: MessageFlags.Ephemeral });
        return;
      }
    }
  }

  const openTickets = await getUserOpenTickets(ctx.storage, guildId, interaction.user.id);
  if (openTickets.length >= panel.maxTicketsPerUser) {
    const existing = openTickets[0];
    await interaction.reply({
      content: t('tooManyOpen', { count: openTickets.length, existing: existing ? `→ <#${existing.channelId}>` : '' }),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const clickedBtn = buttonId ? panel.buttons?.find((b) => b.id === buttonId) : undefined;
  const categoryTag = clickedBtn?.categoryTag;
  const formFields = resolvePanelFields(panel, buttonId);

  if (formFields.length > 0) {
    const modal = new ModalBuilder()
      .setCustomId(`ticket:reason:${panelId}${buttonId ? `:${buttonId}` : ''}`)
      .setTitle((clickedBtn?.label?.trim() || t('modalOpenTitle')).slice(0, 45));
    const fieldRows = formFields.slice(0, 5).map((f) =>
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId(f.id)

          .setLabel((f.label?.trim() || 'Response').slice(0, 45))
          .setStyle(f.style === 'short' ? TextInputStyle.Short : TextInputStyle.Paragraph)
          .setRequired(f.required)
          .setMaxLength(f.maxLength ?? 1000)
          .setPlaceholder(f.placeholder ?? ''),
      ),
    );
    modal.addComponents(...fieldRows);
    await interaction.showModal(modal);
  } else if (panel.requireReason) {

    const modal = new ModalBuilder()
      .setCustomId(`ticket:reason:${panelId}${buttonId ? `:${buttonId}` : ''}`)
      .setTitle(t('modalOpenTitle'))
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('reason')
            .setLabel(t('modalDescribeLabel'))
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder(t('modalDescribePlaceholder'))
            .setRequired(true)
            .setMaxLength(500),
        ),
      );
    await interaction.showModal(modal);
  } else {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await createTicket(ctx, interaction.guild, interaction.user.id, interaction.user.tag, panel, undefined, interaction, categoryTag, undefined, buttonId);
  }
}

export async function createTicket(
  ctx: AddonContext,
  guild: Guild,
  userId: string,
  userTag: string,
  panel: TicketPanel,
  reason: string | undefined,
  interaction: ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction,
  categoryTag?: string,
  formResponses?: Record<string, string>,
  buttonId?: string,
): Promise<void> {
  const guildId = guild.id;
  const loc = await ctx.resolveLocale(interaction);
  const t = (k: string, v?: Record<string, string | number>) => ctx.t(k, loc, v);
  const member = guild.members.cache.get(userId) ?? (await guild.members.fetch(userId).catch(() => null));
  if (!member) {
    await interaction.editReply(t('couldNotFetchMember'));
    return;
  }

  const number = await nextTicketNumber(ctx.storage, guildId);
  const channelName = resolveChannelName(panel, number, member.displayName, categoryTag);

  let channel: TextChannel;
  try {
    channel = await createTicketChannel(guild, panel, member, channelName);
  } catch (err) {
    ctx.logger.error('Failed to create ticket channel', String(err));
    await interaction.editReply(t('failedCreateChannel'));
    return;
  }

  const ticket: Ticket = {
    id: randomUUID(),
    number,
    panelId: panel.id,
    guildId,
    channelId: channel.id,
    userId,
    username: userTag,
    status: 'open',
    priority: 'medium',
    categoryTag,
    buttonId,
    tags: categoryTag ? [categoryTag] : [],
    notes: [],
    reason,
    formResponses,
    createdAt: new Date().toISOString(),
    lastActivity: new Date().toISOString(),
  };

  await saveTicket(ctx.storage, guildId, ticket);

  try {
    const embed = buildTicketEmbed(ticket, panel, member, t);
    const controls = buildTicketControls(channel.id, t);
    const controlsMsg = await channel.send({ content: `<@${userId}>`, embeds: [embed], components: controls });
    ticket.controlsMessageId = controlsMsg.id;
    await saveTicket(ctx.storage, guildId, ticket);
  } catch (err) {
    ctx.logger.warn(`Failed to send welcome embed in ticket #${number}: ${err}`);
  }

  await interaction.editReply(t('ticketCreated', { channel: String(channel) }));

  ctx.logger.info(`Ticket #${number} created in guild ${guildId} by ${userTag}`);

  const config = await getConfig(ctx.storage, guildId);

  let historyLine = '';
  if (config.showUserHistory) {
    const hist = await getUserTicketHistory(ctx, guildId, userId, ticket.id);
    if (hist.count > 0) {
      historyLine = t('historyLine', { count: hist.count, rating: hist.avgRating != null ? `${hist.avgRating.toFixed(1)}★` : '—' });
    }
  }

  if (config.autoTriage && isLLMAvailable()) {
    try {
      const triage = await runTriageModel(ctx, ticket, channel, !!config.autoTriageTag);
      if (triage) {
        ticket.aiTriage = triage;
        if (config.autoTriageSetPriority && ['low', 'medium', 'high'].includes(triage.urgency)) {
          ticket.priority = triage.urgency as TicketPriority;
        }
        if (config.autoTriageTag && triage.tag && !ticket.tags.includes(triage.tag)) {
          ticket.tags.push(triage.tag);
        }
        ticket.notes.push({
          id: randomUUID(),
          authorId: ctx.client.user!.id,
          authorTag: 'AI Triage',
          content: `🧠 ${triage.summary}${triage.reply ? `\n\n💬 ${triage.reply}` : ''}`,
          createdAt: new Date().toISOString(),
        });
        await saveTicket(ctx.storage, guildId, ticket);
      }
    } catch (err) {
      ctx.logger.warn(`Auto-triage failed for #${ticket.number}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (config.businessHours?.enabled && config.businessHours.awayMessage && !isWithinBusinessHours(config.businessHours, Date.now())) {
    await channel.send(config.businessHours.awayMessage).catch(() => null);
  }

  if (config.webhookUrl) {
    fireWebhook(config.webhookUrl, {
      event: 'ticket.opened',
      ticketId: ticket.id,
      number: ticket.number,
      panelName: panel.name,
      userId,
      username: userTag,
      channelId: channel.id,
      guildId,
      createdAt: ticket.createdAt,
    }).catch((err) => ctx.logger.warn(`Webhook delivery failed (ticket.opened): ${err}`));
  }

  if (config.staffNotifyChannelId) {
    const notifyChannel = guild.channels.cache.get(config.staffNotifyChannelId) as TextChannel | undefined;
    if (notifyChannel?.isTextBased() && 'send' in notifyChannel) {
      const rolePing = config.staffNotifyRoleId ? `<@&${config.staffNotifyRoleId}> ` : '';
      let formSummary = '';
      const notifyFields = resolvePanelFields(panel, buttonId);
      if (formResponses && notifyFields.length > 0) {
        formSummary = notifyFields
          .filter((f) => formResponses![f.id])
          .map((f) => `> **${f.label}:** ${formResponses![f.id]}`)
          .join('\n');
      } else if (reason) {
        formSummary = `> ${reason}`;
      }
      const aiLine = ticket.aiTriage ? `\n🧠 ${ticket.aiTriage.summary}` : '';
      const histLine = historyLine ? `\n${historyLine}` : '';
      await notifyChannel.send(
        `${rolePing}📬 New ticket **#${ticket.number}** opened by <@${userId}>${ticket.categoryTag ? ` — \`${ticket.categoryTag}\`` : ''}${formSummary ? `\n${formSummary}` : ''}${aiLine}${histLine}\n→ <#${channel.id}>`,
      ).catch(() => null);
    }
  }

  if (config.autoAssign && panel.staffRoles.length > 0) {
    try {
      const staffRole = guild.roles.cache.get(panel.staffRoles[0]);
      if (staffRole) {
        await guild.members.fetch();
        const staffMembers = staffRole.members.filter((m) => !m.user.bot).toJSON();
        if (staffMembers.length > 0) {
          const idx = (config.roundRobinIndex ?? 0) % staffMembers.length;
          const assignee = staffMembers[idx];
          config.roundRobinIndex = (idx + 1) % staffMembers.length;
          await saveConfig(ctx.storage, guildId, config);
          ticket.status = 'claimed';
          ticket.claimedBy = assignee.id;
          ticket.claimedByTag = assignee.user.tag;
          await saveTicket(ctx.storage, guildId, ticket);
          await channel.send(t('autoAssigned', { mention: `<@${assignee.id}>` })).catch(() => null);
          await sendAssignmentBrief(ctx, ticket, assignee, t, false);
        }
      }
    } catch (err) {
      ctx.logger.warn(`Auto-assign failed: ${err}`);
    }
  }
}

export async function handleReasonModal(
  ctx: AddonContext,
  interaction: ModalSubmitInteraction,
  panelId: string,
  buttonId?: string,
): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId || !interaction.guild) return;
  const loc = await ctx.resolveLocale(interaction);
  const t = (k: string, v?: Record<string, string | number>) => ctx.t(k, loc, v);

  const panel = await getPanel(ctx.storage, guildId, panelId);
  if (!panel) {
    await interaction.reply({ content: t('panelNotFound'), flags: MessageFlags.Ephemeral });
    return;
  }

  const categoryTag = buttonId ? panel.buttons?.find((b) => b.id === buttonId)?.categoryTag : undefined;
  const submitFields = resolvePanelFields(panel, buttonId);

  let reason: string | undefined;
  let formResponses: Record<string, string> | undefined;

  if (submitFields.length > 0) {
    formResponses = {};
    for (const field of submitFields) {
      try {
        const val = interaction.fields.getTextInputValue(field.id).trim();
        if (val) formResponses[field.id] = val;
      } catch {

      }
    }
    const firstTextField = submitFields[0];
    if (firstTextField && formResponses[firstTextField.id]) {
      reason = formResponses[firstTextField.id];
    }
  } else {
    reason = interaction.fields.getTextInputValue('reason').trim();
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  await createTicket(ctx, interaction.guild, interaction.user.id, interaction.user.tag, panel, reason, interaction, categoryTag, formResponses, buttonId);
}
