import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
  GuildMember,
} from 'discord.js';
import type { BotCommand } from '../../types.js';
import type { BotClient } from '../../client.js';
import { getSelfRoles } from './selfrole.js';

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('selfremoverole')
    .setDescription('Remove a self-assignable role from yourself')
    .addStringOption((o) =>
      o.setName('name').setDescription('Name of the role to remove').setRequired(true).setAutocomplete(true)
    ) as unknown as SlashCommandBuilder,

  category: 'utility',

  async execute(interaction: ChatInputCommandInteraction, _client: BotClient) {
    const guildId = interaction.guildId!;
    const name    = interaction.options.getString('name', true).toLowerCase();

    const roles = await getSelfRoles(guildId);
    const entry = roles.find((r) => r.name === name);

    if (!entry) {
      await interaction.reply({ content: `❌ No self-assignable role named \`${name}\`. Use \`/selfrole list\` to see available roles.`, ephemeral: true });
      return;
    }

    const member = interaction.member as GuildMember;
    if (!member.roles.cache.has(entry.roleId)) {
      await interaction.reply({ content: `You don't have the **${name}** role.`, ephemeral: true });
      return;
    }

    const role = interaction.guild?.roles.cache.get(entry.roleId);
    if (!role) {
      await interaction.reply({ content: `❌ The role for \`${name}\` no longer exists.`, ephemeral: true });
      return;
    }

    try {
      await member.roles.remove(role, 'Self-removed via /selfremoverole');
      await interaction.reply({ content: `✅ The <@&${role.id}> role has been removed.`, ephemeral: true });
    } catch {
      await interaction.reply({ content: `❌ Failed to remove the role. Make sure the bot's role is above <@&${role.id}> in the role list.`, ephemeral: true });
    }
  },

  async autocomplete(interaction: AutocompleteInteraction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const member  = interaction.member as GuildMember;
    const roles   = await getSelfRoles(interaction.guildId!);

    const matches = roles
      .filter((r) => r.name.includes(focused) && member.roles.cache.has(r.roleId))
      .slice(0, 25)
      .map((r) => ({ name: r.name, value: r.name }));

    await interaction.respond(matches);
  },
};

export default command;
