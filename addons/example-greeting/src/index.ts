// @ts-nocheck

import { SlashCommandBuilder, EmbedBuilder, type GuildMember } from 'discord.js';
import { defineAddon } from '@arkenbot/addon-sdk';
import { locales } from './locales.js';

export default defineAddon({
  locales,
  manifest: {
    name: 'example-greeting',
    displayName: 'Greeting Bot',
    version: '1.0.0',
    description: 'Sends customizable greeting messages and tracks the most recent greeter.',
    author: 'Example Author',
    homepage: 'https://github.com/example/greeting-addon',
    commands: ['greet'],
    events: ['guildMemberAdd'],
    settings: [
      {
        key: 'message',
        type: 'string',
        label: 'Greeting Message',
        description: 'The message to send. Use {user} and {server} as placeholders.',
        default: 'Hello {user}, welcome to {server}!',
      },
      {
        key: 'channelId',
        type: 'channel',
        label: 'Greeting Channel',
        description: 'Channel where automatic join greetings are sent.',
      },
      {
        key: 'embedColor',
        type: 'color',
        label: 'Embed Color',
        default: '#5865F2',
      },
    ],
  },

  commands: [
    {
      data: new SlashCommandBuilder()
        .setName('greet')
        .setDescription('Greet another member')
        .addUserOption((opt) =>
          opt.setName('user').setDescription('The user to greet').setRequired(true)
        ),
      async execute(interaction, ctx) {
        const targetUser = interaction.options.getUser('user', true);
        if (!interaction.guildId) return;

        const message = await ctx.getSetting<string>(
          interaction.guildId,
          'message',
          'Hello {user}!'
        );
        const color = await ctx.getSetting<string>(interaction.guildId, 'embedColor', '#5865F2');

        const loc = await ctx.resolveLocale(interaction);
        const greeting = message
          .replace('{user}', `<@${targetUser.id}>`)
          .replace('{server}', interaction.guild?.name ?? ctx.t('theServer', loc));

        const embed = new EmbedBuilder()
          .setColor(color as `#${string}`)
          .setDescription(`👋 ${greeting}`)
          .setThumbnail(targetUser.displayAvatarURL())
          .setFooter({ text: ctx.t('footerGreetedBy', loc, { tag: interaction.user.tag }) })
          .setTimestamp();

        await interaction.reply({ embeds: [embed] });

        await ctx.storage.set('lastGreeter', interaction.user.tag, interaction.guildId ?? undefined);
        await ctx.logger.info(`${interaction.user.tag} greeted ${targetUser.tag}`);
      },
    },
  ],

  events: [
    {
      event: 'guildMemberAdd',
      async handler(ctx, member: GuildMember) {
        if (!member.guild) return;

        const channelId = await ctx.getSetting<string>(member.guild.id, 'channelId');
        if (!channelId) return;

        const message = await ctx.getSetting<string>(
          member.guild.id,
          'message',
          'Hello {user}, welcome to {server}!'
        );
        const color = await ctx.getSetting<string>(member.guild.id, 'embedColor', '#5865F2');

        const greeting = message
          .replace('{user}', `<@${member.id}>`)
          .replace('{server}', member.guild.name);

        const channel = member.guild.channels.cache.get(channelId);
        if (!channel?.isTextBased()) return;

        const loc = await ctx.resolveLocale({ user: { id: '' }, guildId: member.guild.id, guildLocale: member.guild.preferredLocale });
        const embed = new EmbedBuilder()
          .setColor(color as `#${string}`)
          .setDescription(`👋 ${greeting}`)
          .setThumbnail(member.user.displayAvatarURL())
          .setFooter({ text: ctx.t('footerMemberCount', loc, { count: member.guild.memberCount }) })
          .setTimestamp();

        await channel.send({ embeds: [embed] }).catch(() => null);
      },
    },
  ],

  hooks: {
    async onLoad(ctx) {
      ctx.logger.info('Greeting addon loaded!');
    },

    async onSettingsUpdate(ctx, guildId, settings) {
      ctx.logger.info(`Settings updated for guild ${guildId}: ${JSON.stringify(settings)}`);
    },

    async onUnload(ctx) {
      ctx.logger.info('Greeting addon unloaded.');
    },
  },
});
