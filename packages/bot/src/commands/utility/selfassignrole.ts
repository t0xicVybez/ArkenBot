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
    .setName('selfassignrole')
    .setDescription('Assign yourself a self-assignable role')
    .addStringOption((o) =>
      o.setName('name').setDescription('Name of the role to assign').setRequired(true).setAutocomplete(true)
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
    if (member.roles.cache.has(entry.roleId)) {
      await interaction.reply({ content: `You already have the **${name}** role.`, ephemeral: true });
      return;
    }

    const role = interaction.guild?.roles.cache.get(entry.roleId);
    if (!role) {
      await interaction.reply({ content: `❌ The role for \`${name}\` no longer exists. Ask an admin to remove it with \`/selfrole remove\`.`, ephemeral: true });
      return;
    }

    try {
      await member.roles.add(role, 'Self-assigned via /selfassignrole');
      await interaction.reply({ content: `✅ You've been given the <@&${role.id}> role.`, ephemeral: true });
    } catch {
      await interaction.reply({ content: `❌ Failed to assign the role. Make sure the bot's role is above <@&${role.id}> in the role list.`, ephemeral: true });
    }
  },

  async autocomplete(interaction: AutocompleteInteraction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const member  = interaction.member as GuildMember;
    const roles   = await getSelfRoles(interaction.guildId!);

    const matches = roles
      .filter((r) => r.name.includes(focused) && !member.roles.cache.has(r.roleId))
      .slice(0, 25)
      .map((r) => ({ name: r.name, value: r.name }));

    await interaction.respond(matches);
  },
};

export default command;
