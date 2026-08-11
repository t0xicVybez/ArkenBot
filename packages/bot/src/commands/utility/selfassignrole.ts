import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
  GuildMember,
} from 'discord.js';
import type { BotCommand } from '../../types.js';
import type { BotClient } from '../../client.js';
import { getSelfRoles } from './selfrole.js';
import { t, resolveUserLocale } from '../../i18n/index.js';

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('selfassignrole')
    .setDescription('Assign yourself a self-assignable role')
    .addStringOption((o) =>
      o.setName('name').setDescription('Name of the role to assign').setRequired(true).setAutocomplete(true)
    ) as unknown as SlashCommandBuilder,

  category: 'utility',

  async execute(interaction: ChatInputCommandInteraction, _client: BotClient) {
    const loc = await resolveUserLocale(interaction);
    const guildId = interaction.guildId!;
    const name    = interaction.options.getString('name', true).toLowerCase();

    const roles = await getSelfRoles(guildId);
    const entry = roles.find((r) => r.name === name);

    if (!entry) {
      await interaction.reply({ content: t('cmd.selfassignrole.noRole', loc, { name }), ephemeral: true });
      return;
    }

    const member = interaction.member as GuildMember;
    if (member.roles.cache.has(entry.roleId)) {
      await interaction.reply({ content: t('cmd.selfassignrole.alreadyHave', loc, { name }), ephemeral: true });
      return;
    }

    const role = interaction.guild?.roles.cache.get(entry.roleId);
    if (!role) {
      await interaction.reply({ content: t('cmd.selfassignrole.roleGone', loc, { name }), ephemeral: true });
      return;
    }

    try {
      await member.roles.add(role, 'Self-assigned via /selfassignrole');
      await interaction.reply({ content: t('cmd.selfassignrole.assigned', loc, { role: `<@&${role.id}>` }), ephemeral: true });
    } catch {
      await interaction.reply({ content: t('cmd.selfassignrole.failed', loc, { role: `<@&${role.id}>` }), ephemeral: true });
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
