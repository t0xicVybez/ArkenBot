/**
 * /vote — shows the top.gg vote link, the user's vote status and streak, this
 * server's vote rewards, and lets the user opt in/out of vote reminders.
 */
import { SlashCommandBuilder, EmbedBuilder, MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import type { BotCommand } from '../../types.js';
import type { BotClient } from '../../client.js';
import { COLORS } from '@arkenbot/shared';
import { prisma } from '../../database.js';

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
      ? `⏳ You can vote again <t:${Math.floor(voter!.eligibleAt!.getTime() / 1000)}:R>`
      : `✅ You can vote right now!`;

    const embed = new EmbedBuilder()
      .setColor(COLORS.INFO)
      .setTitle('🗳️ Vote on top.gg')
      .setDescription(`Support us with a free vote every 12 hours — it takes 10 seconds and really helps.\n\n**[▶ Vote here](${voteUrl})**\n\n${status}`)
      .addFields(
        { name: 'Your votes', value: `${voter?.totalVotes ?? 0}`, inline: true },
        { name: 'Current streak', value: `${voter?.currentStreak ?? 0} 🔥`, inline: true },
        { name: 'Reminders', value: voter?.remindersOptIn ? 'On' : 'Off', inline: true },
      );

    // Show this server's configured rewards, if any.
    if (guildConfig?.enabled) {
      const perks: string[] = [];
      if (guildConfig.voterRoleId) perks.push(`<@&${guildConfig.voterRoleId}> role for ${guildConfig.voterRoleHours}h`);
      if (guildConfig.xpReward > 0) perks.push(`+${guildConfig.xpReward} XP${guildConfig.weekendDouble ? ' (2× on weekends)' : ''}`);
      if (perks.length) embed.addFields({ name: '🎁 Rewards here', value: perks.join('\n') });
    }

    if (reminders) {
      embed.setFooter({ text: reminders === 'on' ? 'Reminders on — I\'ll DM you when you can vote again.' : 'Reminders off.' });
    }

    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;
