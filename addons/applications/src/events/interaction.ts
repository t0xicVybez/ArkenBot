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
      const formId = interaction.customId.split(':')[2];
      const forms = await getForms(ctx.storage, guildId);
      const form = forms.find((f) => f.id === formId);
      if (!form) {
        await interaction.reply({ content: 'Application form not found.', flags: MessageFlags.Ephemeral });
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
          embeds: [buildReviewEmbed(form, submission)],
          components: [buildReviewButtons(submission.id, form.id)],
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
            .setTitle('Application Submitted!')
            .setDescription(`Your application for **${form.name}** has been submitted. Staff will review it shortly.`)
            .setFooter({ text: `Application ID: ${submission.id}` }),
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

      const modal = new ModalBuilder()
        .setCustomId(`app:note:${action}:${formId}:${submissionId}`)
        .setTitle(action === 'accept' ? 'Accept Application' : 'Deny Application')
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('note')
              .setLabel('Review note (optional — sent to applicant)')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(false)
              .setPlaceholder('Leave a note for the applicant…'),
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

      const form = await getForm(ctx.storage, guildId, formId);
      const submission = await getSubmission(ctx.storage, guildId, submissionId);

      if (!form || !submission) {
        await interaction.editReply({ content: 'Application or form not found.' });
        return;
      }
      if (submission.status !== 'pending') {
        await interaction.editReply({ content: `This application has already been **${submission.status}**.` });
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
              embeds: [buildResultEmbed(submission, form, accepted, interaction.user.tag, note)],
              components: [buildReviewButtons(submissionId, formId, true)],
            }).catch(() => null);
          }
        }
      }

      // Assign accept role
      if (accepted && form.acceptRoleId) {
        const member = await interaction.guild?.members.fetch(submission.userId).catch(() => null);
        if (member) await member.roles.add(form.acceptRoleId).catch(() => null);
      }

      // DM the applicant
      const dmText = accepted
        ? (form.acceptDmMessage ?? `Your application for **${form.name}** in **${interaction.guild?.name}** has been **accepted**! 🎉${note ? `\n\n> ${note}` : ''}`)
        : (form.denyDmMessage ?? `Your application for **${form.name}** in **${interaction.guild?.name}** has been **denied**.${note ? `\n\n> ${note}` : ''}`);

      const applicant = await interaction.client.users.fetch(submission.userId).catch(() => null);
      if (applicant) {
        await applicant.send({
          embeds: [
            new EmbedBuilder()
              .setColor(accepted ? 0x57f287 : 0xed4245)
              .setTitle(accepted ? '✅ Application Accepted' : '❌ Application Denied')
              .setDescription(dmText)
              .setFooter({ text: `Application ID: ${submission.id}` })
              .setTimestamp(),
          ],
        }).catch(() => null);
      }

      await interaction.editReply({
        content: `Application **${accepted ? 'accepted' : 'denied'}** for <@${submission.userId}>.`,
      });
    }
  },
};
