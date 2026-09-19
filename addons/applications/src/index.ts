import { defineAddon } from '@arkenbot/addon-sdk';
import type { AddonContext } from '@arkenbot/addon-sdk';
import { EmbedBuilder, type AutocompleteInteraction, type Interaction, type TextChannel } from 'discord.js';
import { Redis } from 'ioredis';
import applyCommand from './commands/apply.js';
import appSetupCommand from './commands/app-setup.js';
import { interactionHandler } from './events/interaction.js';
import { getForm, getSubmission } from './utils/storage.js';
import { buildResultEmbed, buildReviewButtons } from './utils/embeds.js';
import { locales } from './locales.js';

let redisSub: Redis | null = null;

/**
 * Applies the side-effects of an accept/deny performed from the web dashboard.
 * The dashboard API only updates the stored submission status and publishes an
 * `applications:review` event; without this handler the accept role is never
 * granted and the applicant is never notified (unlike the in-Discord button
 * flow, which does this inline).
 */
async function handleDashboardReview(ctx: AddonContext, raw: string): Promise<void> {
  const { guildId, submissionId, action, note, reviewerTag } = JSON.parse(raw) as {
    guildId: string; submissionId: string; action: 'accept' | 'deny'; note?: string; reviewerTag?: string;
  };
  const submission = await getSubmission(ctx.storage, guildId, submissionId);
  if (!submission) return;
  const form = await getForm(ctx.storage, guildId, submission.formId);
  if (!form) return;

  const guild = ctx.client.guilds.cache.get(guildId);
  if (!guild) return;
  const accepted = action === 'accept';

  // Assign the accept role.
  if (accepted && form.acceptRoleId) {
    const member = await guild.members.fetch(submission.userId).catch(() => null);
    if (member) await member.roles.add(form.acceptRoleId).catch(() => null);
  }

  // Update the staff review embed, if one was posted.
  if (submission.reviewChannelId && submission.reviewMessageId) {
    const guildLoc = await ctx.resolveLocale({ user: { id: '' }, guildId, guildLocale: guild.preferredLocale });
    const gt = (k: string, v?: Record<string, string | number>) => ctx.t(k, guildLoc, v);
    const ch = guild.channels.cache.get(submission.reviewChannelId) as TextChannel | undefined;
    if (ch?.isTextBased()) {
      const msg = await ch.messages.fetch(submission.reviewMessageId).catch(() => null);
      if (msg) {
        await msg.edit({
          embeds: [buildResultEmbed(submission, form, accepted, reviewerTag ?? 'Dashboard', gt, note)],
          components: [buildReviewButtons(submissionId, submission.formId, gt, true)],
        }).catch(() => null);
      }
    }
  }

  // DM the applicant in their own language.
  const applicantLoc = await ctx.resolveLocale({ user: { id: submission.userId }, guildId, guildLocale: guild.preferredLocale });
  const dmt = (k: string, v?: Record<string, string | number>) => ctx.t(k, applicantLoc, v);
  const noteSuffix = note ? `\n\n> ${note}` : '';
  const dmText = accepted
    ? (form.acceptDmMessage ?? `${dmt('dmAcceptDefault', { name: form.name, guild: guild.name })}${noteSuffix}`)
    : (form.denyDmMessage ?? `${dmt('dmDenyDefault', { name: form.name, guild: guild.name })}${noteSuffix}`);
  const applicant = await ctx.client.users.fetch(submission.userId).catch(() => null);
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
}

export default defineAddon({
  locales,
  manifest: {
    name: 'applications',
    displayName: 'Application System',
    version: '1.0.0',
    description: 'Configurable application forms with modal collection, staff review channel, and accept/deny workflow.',
    author: 't0xicVybez',
    commands: ['apply', 'app-setup'],
    settings: [],
  },

  commands: [applyCommand, appSetupCommand],

  events: [
    {
      event: 'interactionCreate',
      handler: async (ctx: AddonContext, ...args: unknown[]): Promise<void> => {
        const interaction = args[0] as Interaction;

        // Route autocomplete to the correct command handler
        if (interaction.isAutocomplete()) {
          if (interaction.commandName === 'apply' && applyCommand.autocomplete) {
            await applyCommand.autocomplete(interaction as AutocompleteInteraction, ctx);
          } else if (interaction.commandName === 'app-setup' && appSetupCommand.autocomplete) {
            await appSetupCommand.autocomplete(interaction as AutocompleteInteraction, ctx);
          }
          return;
        }

        await interactionHandler.handle(ctx, interaction);
      },
    },
  ],

  hooks: {
    onLoad(ctx: AddonContext): void {
      // Handle accept/deny performed from the web dashboard (the in-Discord
      // button flow is handled inline by interactionHandler).
      void (async () => {
        try {
          redisSub = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
            password: process.env.REDIS_PASSWORD || undefined,
            lazyConnect: true,
          });
          await redisSub.connect();
          await redisSub.subscribe('applications:review');
          redisSub.on('message', (channel: string, message: string) => {
            if (channel === 'applications:review') {
              void handleDashboardReview(ctx, message).catch((err) =>
                ctx.logger.error('Failed to process dashboard application review', String(err)));
            }
          });
        } catch (err) {
          ctx.logger.error('Applications: failed to subscribe to applications:review', String(err));
        }
      })();
      ctx.logger.info('Application System loaded.');
    },
    onUnload(): void {
      void redisSub?.quit().catch(() => {});
      redisSub = null;
    },
  },
});
