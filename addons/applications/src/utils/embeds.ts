import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import type { ApplicationForm, ApplicationSubmission } from '../types.js';

/** Translator bound to the viewer's locale, passed in from the addon context. */
type Translate = (key: string, vars?: Record<string, string | number>) => string;

export function buildReviewEmbed(form: ApplicationForm, sub: ApplicationSubmission, t: Translate): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(t('reviewTitle', { name: form.name }))
    .setDescription(t('reviewSubmittedBy', { mention: `<@${sub.userId}>`, tag: sub.userTag }))
    .setTimestamp(new Date(sub.submittedAt));

  for (const field of form.fields) {
    const answer = sub.answers[field.id] ?? t('noAnswer');
    embed.addFields({
      name: field.label,
      value: answer.length > 1024 ? answer.slice(0, 1021) + '…' : answer,
    });
  }

  embed.addFields({ name: t('fieldStatus'), value: t('statusPendingReview'), inline: true });
  embed.setFooter({ text: t('appId', { id: sub.id }) });
  return embed;
}

export function buildReviewButtons(submissionId: string, formId: string, t: Translate, disabled = false): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`app:accept:${formId}:${submissionId}`)
      .setLabel(t('btnAccept'))
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`app:deny:${formId}:${submissionId}`)
      .setLabel(t('btnDeny'))
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled),
  );
}

export function buildResultEmbed(sub: ApplicationSubmission, form: ApplicationForm, accepted: boolean, reviewerTag: string, t: Translate, note?: string): EmbedBuilder {
  const color = accepted ? 0x57f287 : 0xed4245;
  const emoji = accepted ? '✅' : '❌';
  const status = accepted ? t('statusAccepted') : t('statusDenied');
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(t('resultTitle', { emoji, status, name: form.name }))
    .setDescription(t('resultApplicant', { mention: `<@${sub.userId}>`, tag: sub.userTag }))
    .addFields(
      { name: t('fieldReviewedBy'), value: reviewerTag, inline: true },
      ...(note ? [{ name: t('fieldNote'), value: note }] : []),
    )
    .setFooter({ text: t('appId', { id: sub.id }) })
    .setTimestamp();
}
