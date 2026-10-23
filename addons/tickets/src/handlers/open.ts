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
  type GuildMember,
} from 'discord.js';
import { randomUUID } from 'crypto';
import { isLLMAvailable } from '@arkenbot/shared';
import type { AddonContext } from '@arkenbot/addon-sdk';
import type { Ticket, TicketPriority, TicketPanel, GuildTicketConfig } from '../types.js';
import {
  getPanel,
  getConfig,
  getUserOpenTickets,
  getTickets,
  nextTicketNumber,
  saveTicket,
  updateConfig,
} from '../utils/storage.js';
import { resolvePanelFields } from '../utils/fields.js';
import { buildTicketEmbed, buildTicketControls } from '../utils/embeds.js';
import { createTicketChannel, resolveChannelName } from '../utils/channel.js';
import { pickLeastLoadedAssignee } from '../utils/assign.js';
import { isWithinBusinessHours } from '../utils/time.js';
import { fireWebhook } from '../utils/webhook.js';
import { withUserLock } from '../utils/userLock.js';
import { runTriageModel, getUserTicketHistory, sendAssignmentBrief } from './triage.js';

type OpenBlock =
  | { kind: 'cooldown'; readyAt: number }
  | { kind: 'limit'; count: number; existing: Ticket | undefined };

// Open-limit and cooldown rules, shared by the early button check and the
// locked creation path so the form-modal route can't skip them.
async function findOpenBlock(
  ctx: AddonContext,
  guildId: string,
  panel: TicketPanel,
  config: GuildTicketConfig,
  userId: string,
): Promise<OpenBlock | null> {
  if (config.openCooldownMinutes && config.openCooldownMinutes > 0) {
    const last = (await getTickets(ctx.storage, guildId))
      .filter((x) => x.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
    if (last) {
      const cdMs = config.openCooldownMinutes * 60000;
      const lastOpenedMs = new Date(last.createdAt).getTime();
      if (Date.now() - lastOpenedMs < cdMs) return { kind: 'cooldown', readyAt: Math.floor((lastOpenedMs + cdMs) / 1000) };
    }
  }
  const openHere = (await getUserOpenTickets(ctx.storage, guildId, userId)).filter((x) => x.panelId === panel.id);
  if (openHere.length >= panel.maxTicketsPerUser) return { kind: 'limit', count: openHere.length, existing: openHere[0] };
  return null;
}

function openBlockMessage(block: OpenBlock, t: (k: string, v?: Record<string, string | number>) => string): string {
  return block.kind === 'cooldown'
    ? t('openCooldown', { when: `<t:${block.readyAt}:R>` })
    : t('tooManyOpen', { count: block.count, existing: block.existing ? `→ <#${block.existing.channelId}>` : '' });
}

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

  const block = await findOpenBlock(ctx, guildId, panel, config, interaction.user.id);
  if (block) {
    await interaction.reply({ content: openBlockMessage(block, t), flags: MessageFlags.Ephemeral });
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
  await withUserLock(guild.id, userId, () =>
    createTicketLocked(ctx, guild, userId, userTag, panel, reason, interaction, categoryTag, formResponses, buttonId),
  );
}

async function createTicketLocked(
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

  const limitConfig = await getConfig(ctx.storage, guildId);
  const block = await findOpenBlock(ctx, guildId, panel, limitConfig, userId);
  if (block) {
    await interaction.editReply(openBlockMessage(block, t));
    return;
  }

  const number = await nextTicketNumber(ctx.storage, guildId);
  const channelName = resolveChannelName(panel, number, member.displayName, categoryTag);

  let channel: TextChannel;
  try {
    channel = await createTicketChannel(guild, panel, member, channelName);
  } catch (err) {
    // Include the real cause in the message — the addon logger forwards extra
    // args as pino interpolation values, which get dropped when the message has
    // no placeholder, so the error was previously invisible. Usual causes:
    // missing Manage Channels, a deleted/invalid category, or Discord's
    // 50-channels-per-category limit.
    ctx.logger.error(`Failed to create ticket channel (guild ${guildId}): ${err instanceof Error ? err.message : String(err)}`);
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
    }, config.webhookSecret).catch((err) => ctx.logger.warn(`Webhook delivery failed (ticket.opened): ${err}`));
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
      await guild.members.fetch();
      // Union of members across every configured staff role (not just the
      // first one — a panel can have several), deduped.
      const staffMembers = new Map<string, GuildMember>();
      for (const roleId of panel.staffRoles) {
        const role = guild.roles.cache.get(roleId);
        if (!role) continue;
        for (const [id, member] of role.members) {
          if (!member.user.bot) staffMembers.set(id, member);
        }
      }

      if (staffMembers.size > 0) {
        const openTickets = (await getTickets(ctx.storage, guildId)).filter((tk) => tk.status !== 'closed');
        const loadByUser = new Map<string, number>();
        for (const tk of openTickets) {
          if (tk.claimedBy) loadByUser.set(tk.claimedBy, (loadByUser.get(tk.claimedBy) ?? 0) + 1);
        }

        const candidates = [...staffMembers.values()];
        // The tie-break index is read and advanced under the config lock, so two
        // tickets opened at the same moment can't both take the same turn.
        let assignee = null as GuildMember | null;
        await updateConfig(ctx.storage, guildId, (cfg) => {
          const result = pickLeastLoadedAssignee(candidates, loadByUser, cfg.roundRobinIndex ?? 0);
          if (result) {
            cfg.roundRobinIndex = result.nextIndex;
            assignee = result.assignee;
          }
        });
        if (assignee) {
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
