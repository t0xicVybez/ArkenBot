/**
 * /vote — shows the top.gg vote link, the user's vote status and streak, this
 * server's vote rewards, and lets the user opt in/out of vote reminders.
 */
import { SlashCommandBuilder, EmbedBuilder, MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import type { BotCommand } from '../../types.js';
import type { BotClient } from '../../client.js';
import { COLORS } from '@arkenbot/shared';
import { prisma } from '../../database.js';
import { t, resolveUserLocale } from '../../i18n/index.js';

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('vote')
    .setDescription('Vote for the bot on top.gg and see your rewards')
    .addStringOption((o) =>
      o
        .setName('reminders')
        .setDescription('Get a DM when you can vote again')
        .setRequired(false)
        .addChoices({ name: 'Turn on', value: 'on' }, { name: 'Turn off', value: 'off' }),
    ),
  category: 'community',

  async execute(interaction: ChatInputCommandInteraction, client: BotClient) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const loc = await resolveUserLocale(interaction);

    // Prefer this server's configured vote link (e.g. its own top.gg server
    // listing); fall back to the bot's vote page.
    const guildConfig = interaction.guildId
      ? await prisma.topggConfig.findUnique({ where: { guildId: interaction.guildId } })
      : null;
    const voteUrl = guildConfig?.voteUrl || `https://top.gg/bot/${client.user!.id}/vote`;
    const reminders = interaction.options.getString('reminders');

    // Toggle reminders if requested.
    if (reminders) {
      const optIn = reminders === 'on';
      await prisma.topggVoter.upsert({
        where: { userId: interaction.user.id },
        create: { userId: interaction.user.id, remindersOptIn: optIn },
        update: { remindersOptIn: optIn },
      });
    }

    const voter = await prisma.topggVoter.findUnique({ where: { userId: interaction.user.id } });
    const now = Date.now();
    const onCooldown = voter?.eligibleAt && voter.eligibleAt.getTime() > now;

    const status = onCooldown
      ? t('cmd.vote.statusCooldown', loc, { time: `<t:${Math.floor(voter!.eligibleAt!.getTime() / 1000)}:R>` })
      : t('cmd.vote.statusReady', loc);

    const embed = new EmbedBuilder()
      .setColor(COLORS.INFO)
      .setTitle(t('cmd.vote.title', loc))
      .setDescription(t('cmd.vote.description', loc, { voteUrl, status }))
      .addFields(
        { name: t('cmd.vote.yourVotes', loc), value: `${voter?.totalVotes ?? 0}`, inline: true },
        { name: t('cmd.vote.currentStreak', loc), value: t('cmd.vote.streakValue', loc, { count: voter?.currentStreak ?? 0 }), inline: true },
        { name: t('cmd.vote.reminders', loc), value: voter?.remindersOptIn ? t('cmd.vote.on', loc) : t('cmd.vote.off', loc), inline: true },
      );

    // Show this server's configured rewards, if any.
    if (guildConfig?.enabled) {
      const perks: string[] = [];
      if (guildConfig.voterRoleId) perks.push(t('cmd.vote.perkRole', loc, { role: `<@&${guildConfig.voterRoleId}>`, hours: guildConfig.voterRoleHours }));
      if (guildConfig.xpReward > 0) perks.push(`${t('cmd.vote.perkXp', loc, { xp: guildConfig.xpReward })}${guildConfig.weekendDouble ? t('cmd.vote.perkWeekend', loc) : ''}`);
      if (perks.length) embed.addFields({ name: t('cmd.vote.rewardsHere', loc), value: perks.join('\n') });
    }

    if (reminders) {
      embed.setFooter({ text: reminders === 'on' ? t('cmd.vote.footerOn', loc) : t('cmd.vote.footerOff', loc) });
    }

    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;
