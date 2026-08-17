/**
 * Handles all application-related interactions:
 *  - Modal submit: app:submit:<formId>       — collects answers, posts to review channel
 *  - Button:       app:accept/deny:<formId>:<submissionId> — shows review-note modal
 *  - Modal submit: app:note:accept/deny:<formId>:<submissionId> — finalises decision
 */
import {
  Events,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
  MessageFlags,
  type Interaction,
  type TextChannel,
} from 'discord.js';
import type { AddonContext } from '@arkenbot/addon-sdk';
import { getForm, getSubmission, saveSubmission, getForms, generateId } from '../utils/storage.js';
import { buildReviewEmbed, buildReviewButtons, buildResultEmbed } from '../utils/embeds.js';
import type { ApplicationSubmission } from '../types.js';

export const interactionHandler = {
  event: Events.InteractionCreate,

  async handle(ctx: AddonContext, interaction: Interaction): Promise<void> {
    if (!interaction.guildId) return;
    const guildId = interaction.guildId;

    // ─── Autocomplete for /apply and /app-setup ───────────────────────────────
    if (interaction.isAutocomplete()) return; // handled per-command in index.ts

    // ─── Modal: /apply submission ─────────────────────────────────────────────
    if (interaction.isModalSubmit() && interaction.customId.startsWith('app:submit:')) {
      const applicantLoc = await ctx.resolveLocale(interaction);
      const guildLoc = await ctx.resolveLocale({ user: { id: '' }, guildId, guildLocale: interaction.guild?.preferredLocale });
      const at = (k: string, v?: Record<string, string | number>) => ctx.t(k, applicantLoc, v);
      const gt = (k: string, v?: Record<string, string | number>) => ctx.t(k, guildLoc, v);
      const formId = interaction.customId.split(':')[2];
      const forms = await getForms(ctx.storage, guildId);
      const form = forms.find((f) => f.id === formId);
      if (!form) {
        await interaction.reply({ content: at('formNotFound'), flags: MessageFlags.Ephemeral });
        return;
      }

      const answers: Record<string, string> = {};
      for (const field of form.fields.slice(0, 5)) {
        answers[field.id] = interaction.fields.getTextInputValue(field.id) || '';
      }

      const submission: ApplicationSubmission = {
        id: generateId(),
        formId: form.id,
        guildId,
        userId: interaction.user.id,
        userTag: interaction.user.tag,
        answers,
        status: 'pending',
        submittedAt: new Date().toISOString(),
      };

      await saveSubmission(ctx.storage, guildId, submission);

      const reviewChannel = interaction.guild?.channels.cache.get(form.reviewChannelId);
      if (reviewChannel && 'send' in reviewChannel) {
        const msg = await (reviewChannel as TextChannel).send({
          embeds: [buildReviewEmbed(form, submission, gt)],
          components: [buildReviewButtons(submission.id, form.id, gt)],
        }).catch(() => null);
        if (msg) {
          submission.reviewMessageId = msg.id;
          submission.reviewChannelId = msg.channelId;
          await saveSubmission(ctx.storage, guildId, submission);
        }
      }

      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x57f287)
            .setTitle(at('submittedTitle'))
            .setDescription(at('submittedDesc', { name: form.name }))
            .setFooter({ text: at('appId', { id: submission.id }) }),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // ─── Button: accept or deny ───────────────────────────────────────────────
    if (interaction.isButton()) {
      const id = interaction.customId;
      if (!id.startsWith('app:accept:') && !id.startsWith('app:deny:')) return;

      const parts = id.split(':');
      const action = parts[1] as 'accept' | 'deny';
      const formId = parts[2];
      const submissionId = parts[3];

      const reviewerLoc = await ctx.resolveLocale(interaction);
      const modal = new ModalBuilder()
        .setCustomId(`app:note:${action}:${formId}:${submissionId}`)
        .setTitle(ctx.t(action === 'accept' ? 'modalAcceptTitle' : 'modalDenyTitle', reviewerLoc))
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('note')
              .setLabel(ctx.t('modalNoteLabel', reviewerLoc))
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(false)
              .setPlaceholder(ctx.t('modalNotePlaceholder', reviewerLoc)),
          ),
        );

      await interaction.showModal(modal);
      return;
    }

    // ─── Modal: finalize accept/deny ──────────────────────────────────────────
    if (interaction.isModalSubmit() && interaction.customId.startsWith('app:note:')) {
      const parts = interaction.customId.split(':');
      const action = parts[2] as 'accept' | 'deny';
      const formId = parts[3];
      const submissionId = parts[4];

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const reviewerLoc = await ctx.resolveLocale(interaction);
      const guildLoc = await ctx.resolveLocale({ user: { id: '' }, guildId, guildLocale: interaction.guild?.preferredLocale });
      const rt = (k: string, v?: Record<string, string | number>) => ctx.t(k, reviewerLoc, v);
      const gt = (k: string, v?: Record<string, string | number>) => ctx.t(k, guildLoc, v);

      const form = await getForm(ctx.storage, guildId, formId);
      const submission = await getSubmission(ctx.storage, guildId, submissionId);

      if (!form || !submission) {
        await interaction.editReply({ content: rt('appOrFormNotFound') });
        return;
      }
      if (submission.status !== 'pending') {
        const statusWord = submission.status === 'accepted' ? rt('statusAccepted') : submission.status === 'denied' ? rt('statusDenied') : rt('statusPendingWord');
        await interaction.editReply({ content: rt('alreadyReviewed', { status: statusWord }) });
        return;
      }

      const note = interaction.fields.getTextInputValue('note').trim() || undefined;
      const accepted = action === 'accept';

      submission.status = accepted ? 'accepted' : 'denied';
      submission.reviewerId = interaction.user.id;
      submission.reviewerTag = interaction.user.tag;
      if (note) submission.reviewNote = note;
      await saveSubmission(ctx.storage, guildId, submission);

      // Update the original review embed
      if (submission.reviewChannelId && submission.reviewMessageId) {
        const ch = interaction.guild?.channels.cache.get(submission.reviewChannelId);
        if (ch && 'messages' in ch) {
          const msg = await (ch as TextChannel).messages.fetch(submission.reviewMessageId).catch(() => null);
          if (msg) {
            await msg.edit({
              embeds: [buildResultEmbed(submission, form, accepted, interaction.user.tag, gt, note)],
              components: [buildReviewButtons(submissionId, formId, gt, true)],
            }).catch(() => null);
          }
        }
      }

      // Assign accept role
      if (accepted && form.acceptRoleId) {
        const member = await interaction.guild?.members.fetch(submission.userId).catch(() => null);
        if (member) await member.roles.add(form.acceptRoleId).catch(() => null);
      }

      // DM the applicant — in the applicant's own language.
      const applicantLoc = await ctx.resolveLocale({ user: { id: submission.userId }, guildId, guildLocale: interaction.guild?.preferredLocale });
      const dmt = (k: string, v?: Record<string, string | number>) => ctx.t(k, applicantLoc, v);
      const noteSuffix = note ? `\n\n> ${note}` : '';
      const dmText = accepted
        ? (form.acceptDmMessage ?? `${dmt('dmAcceptDefault', { name: form.name, guild: interaction.guild?.name ?? '' })}${noteSuffix}`)
        : (form.denyDmMessage ?? `${dmt('dmDenyDefault', { name: form.name, guild: interaction.guild?.name ?? '' })}${noteSuffix}`);

      const applicant = await interaction.client.users.fetch(submission.userId).catch(() => null);
      if (applicant) {
        await applicant.send({
          embeds: [
            new EmbedBuilder()
              .setColor(accepted ? 0x57f287 : 0xed4245)
              .setTitle(dmt(accepted ? 'dmAcceptTitle' : 'dmDenyTitle'))
              .setDescription(dmText)
              .setFooter({ text: dmt('appId', { id: submission.id }) })
              .setTimestamp(),
          ],
        }).catch(() => null);
      }

      await interaction.editReply({
        content: rt('finalizeResult', { decision: rt(accepted ? 'decisionAccepted' : 'decisionDenied'), mention: `<@${submission.userId}>` }),
      });
    }
  },
};
