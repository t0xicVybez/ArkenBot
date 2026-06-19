import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import type { ApplicationForm, ApplicationSubmission } from '../types.js';

export function buildReviewEmbed(form: ApplicationForm, sub: ApplicationSubmission): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`📋 New Application: ${form.name}`)
    .setDescription(`Submitted by <@${sub.userId}> (${sub.userTag})`)
    .setTimestamp(new Date(sub.submittedAt));

  for (const field of form.fields) {
    const answer = sub.answers[field.id] ?? '*(no answer)*';
    embed.addFields({
      name: field.label,
      value: answer.length > 1024 ? answer.slice(0, 1021) + '…' : answer,
    });
  }

  embed.addFields({ name: 'Status', value: '⏳ Pending review', inline: true });
  embed.setFooter({ text: `Application ID: ${sub.id}` });
  return embed;
}

export function buildReviewButtons(submissionId: string, formId: string, disabled = false): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`app:accept:${formId}:${submissionId}`)
      .setLabel('Accept')
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`app:deny:${formId}:${submissionId}`)
      .setLabel('Deny')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled),
  );
}

export function buildResultEmbed(sub: ApplicationSubmission, form: ApplicationForm, accepted: boolean, reviewerTag: string, note?: string): EmbedBuilder {
  const color = accepted ? 0x57f287 : 0xed4245;
  const emoji = accepted ? '✅' : '❌';
  const status = accepted ? 'Accepted' : 'Denied';
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(`${emoji} Application ${status}: ${form.name}`)
    .setDescription(`**Applicant:** <@${sub.userId}> (${sub.userTag})`)
    .addFields(
      { name: 'Reviewed by', value: reviewerTag, inline: true },
      ...(note ? [{ name: 'Note', value: note }] : []),
    )
    .setFooter({ text: `Application ID: ${sub.id}` })
    .setTimestamp();
}
