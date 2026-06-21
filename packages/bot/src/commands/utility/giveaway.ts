/**
 * /giveaway command — manages server giveaways: start with a prize and duration,
 * end early, or reroll winners for an already-ended giveaway.
 */
import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { BotCommand } from '../../types.js';
import type { BotClient } from '../../client.js';
import { prisma } from '../../database.js';
import { getGuildSettings } from '../../utils/settings.js';

/**
 * Parses a short duration string (e.g. `1h`, `7d`) into milliseconds.
 * Returns null if the format is unrecognised.
 */
function parseDuration(str: string): number | null {
  const match = str.match(/^(\d+)(s|m|h|d|w)$/i);
  if (!match) return null;
  const n = parseInt(match[1]);
  const unit: Record<string, number> = { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 };
  return n * (unit[match[2].toLowerCase()] ?? 0);
}

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Giveaway management')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(s => s.setName('start')
      .setDescription('Start a giveaway')
      .addStringOption(o => o.setName('prize').setDescription('What are you giving away?').setRequired(true))
      .addStringOption(o => o.setName('duration').setDescription('How long (e.g. 1h, 1d, 7d)').setRequired(true))
      .addIntegerOption(o => o.setName('winners').setDescription('Number of winners').setRequired(false).setMinValue(1).setMaxValue(20))
      .addRoleOption(o => o.setName('required-role').setDescription('Role required to enter').setRequired(false))
      .addRoleOption(o => o.setName('bonus-role').setDescription('Role that gets bonus entries').setRequired(false))
      .addIntegerOption(o => o.setName('bonus-entries').setDescription('Extra entries for bonus-role holders').setMinValue(1).setMaxValue(10).setRequired(false)))
    .addSubcommand(s => s.setName('end')
      .setDescription('End a giveaway early')
      .addStringOption(o => o.setName('id').setDescription('Giveaway ID').setRequired(true)))
    .addSubcommand(s => s.setName('reroll')
      .setDescription('Reroll winners for a giveaway')
      .addStringOption(o => o.setName('id').setDescription('Giveaway ID').setRequired(true))),
  category: 'utility',
  cooldown: 5,

  async execute(interaction: ChatInputCommandInteraction, _client: BotClient) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'start') {
      const prize = interaction.options.getString('prize', true);
      const durationStr = interaction.options.getString('duration', true);
      const winnersCount = interaction.options.getInteger('winners') ?? 1;
      const ms = parseDuration(durationStr);

      if (!ms || ms < 10000) {
        await interaction.reply({ content: 'Invalid duration.', flags: 64 });
        return;
      }

      const endsAt = new Date(Date.now() + ms);
      const requiredRole = interaction.options.getRole('required-role');
      const bonusRole = interaction.options.getRole('bonus-role');
      const bonusEntries = interaction.options.getInteger('bonus-entries') ?? 1;

      const guildSettings = await getGuildSettings(interaction.guildId!);
      const giveawayColor = guildSettings?.giveawayColor
        ? (parseInt(guildSettings.giveawayColor.replace('#', ''), 16) as number)
        : 0xf1c40f;

      let description = `**Prize:** ${prize}\n**Winners:** ${winnersCount}\n**Ends:** <t:${Math.floor(endsAt.getTime() / 1000)}:R>`;
      if (requiredRole) description += `\n**Required Role:** <@&${requiredRole.id}>`;
      if (bonusRole) description += `\n**Bonus Entries:** <@&${bonusRole.id}> gets +${bonusEntries} entries`;
      description += '\n\nReact with 🎉 to enter!';

      const embed = new EmbedBuilder()
        .setTitle('🎉 Giveaway!')
        .setDescription(description)
        .setColor(giveawayColor)
        .setFooter({ text: `${winnersCount} winner${winnersCount > 1 ? 's' : ''}` })
        .setTimestamp(endsAt);

      if (!interaction.channel?.isTextBased()) return;
      const msg = await (interaction.channel as import('discord.js').TextChannel).send({ embeds: [embed] });
      await msg.react('🎉');

      const bonusRoleEntries = bonusRole ? [{ roleId: bonusRole.id, bonusEntries }] : null;

      const giveaway = await prisma.giveaway.create({
        data: {
          guildId: interaction.guildId!,
          channelId: interaction.channelId,
          messageId: msg.id,
          hostId: interaction.user.id,
          prize,
          winnersCount,
          endsAt,
          requiredRoleId: requiredRole?.id ?? null,
          bonusRoleEntries: bonusRoleEntries ?? undefined,
        },
      });

      await interaction.reply({ content: `Giveaway started! ID: \`${giveaway.id}\``, flags: 64 });
    }

    if (sub === 'end') {
      const id = interaction.options.getString('id', true);
      const giveaway = await prisma.giveaway.findFirst({ where: { id, guildId: interaction.guildId! } });
      if (!giveaway) {
        await interaction.reply({ content: 'Giveaway not found.', flags: 64 });
        return;
      }
      if (giveaway.ended) {
        await interaction.reply({ content: 'Giveaway already ended.', flags: 64 });
        return;
      }
      // Setting endsAt to now triggers the next background-job cycle to process the end.
      await prisma.giveaway.update({ where: { id }, data: { endsAt: new Date() } });
      await interaction.reply({ content: 'Giveaway will end on the next check cycle (within 1 minute).', flags: 64 });
    }

    if (sub === 'reroll') {
      const id = interaction.options.getString('id', true);
      const giveaway = await prisma.giveaway.findFirst({ where: { id, guildId: interaction.guildId!, ended: true } });
      if (!giveaway || !giveaway.messageId) {
        await interaction.reply({ content: 'Giveaway not found or not yet ended.', flags: 64 });
        return;
      }

      const channel = interaction.guild!.channels.cache.get(giveaway.channelId);
      if (!channel?.isTextBased()) {
        await interaction.reply({ content: 'Could not find giveaway channel.', flags: 64 });
        return;
      }

      const msg = await channel.messages.fetch(giveaway.messageId).catch(() => null);
      if (!msg) {
        await interaction.reply({ content: 'Could not find giveaway message.', flags: 64 });
        return;
      }

      const reaction = msg.reactions.cache.get('🎉');
      if (!reaction) {
        await interaction.reply({ content: 'No reactions found.', flags: 64 });
        return;
      }

      const users = await reaction.users.fetch();
      let eligible = users.filter(u => !u.bot && u.id !== giveaway.hostId);

      // Filter by required role if set
      if (giveaway.requiredRoleId) {
        eligible = eligible.filter(u => interaction.guild!.members.cache.get(u.id)?.roles.cache.has(giveaway.requiredRoleId!) ?? false);
      }

      if (eligible.size === 0) {
        await interaction.reply({ content: 'No eligible entrants.', flags: 64 });
        return;
      }

      // Build entries array with bonus role duplicates
      let entries = [...eligible.values()];
      const bonusRoleEntries = giveaway.bonusRoleEntries as Array<{ roleId: string; bonusEntries: number }> | null;
      if (bonusRoleEntries && bonusRoleEntries.length > 0) {
        for (const bonus of bonusRoleEntries) {
          for (const user of eligible.values()) {
            if (interaction.guild!.members.cache.get(user.id)?.roles.cache.has(bonus.roleId)) {
              for (let i = 0; i < bonus.bonusEntries; i++) entries.push(user);
            }
          }
        }
      }

      const winners = entries.sort(() => Math.random() - 0.5).slice(0, giveaway.winnersCount);
      const winnerMentions = winners.map(w => `<@${w.id}>`).join(', ');

      await channel.send({ content: `🎉 Reroll! New winner${winners.length > 1 ? 's' : ''}: ${winnerMentions}! Congratulations on winning **${giveaway.prize}**!` });
      await interaction.reply({ content: 'Rerolled!', flags: 64 });
    }
  },
};

export default command;
