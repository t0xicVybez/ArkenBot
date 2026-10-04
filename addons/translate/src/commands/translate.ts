import {
  SlashCommandBuilder, EmbedBuilder, MessageFlags,
  type ChatInputCommandInteraction, type ContextMenuCommandInteraction,
} from 'discord.js';
import type { AddonContext, AddonCommandDefinition } from '@arkenbot/addon-sdk';
import { translate, isTranslateAvailable, langName, LANG_CHOICES } from '../service.js';

const cooldowns = new Map<string, number>();
function cooldown(userId: string, ms = 4000): number {
  const now = Date.now();
  const until = cooldowns.get(userId) ?? 0;
  if (now < until) return Math.ceil((until - now) / 1000);
  cooldowns.set(userId, now + ms);
  return 0;
}

const command: AddonCommandDefinition = {
  data: new SlashCommandBuilder()
    .setName('translate')
    .setDescription('Translate text to another language')
    .addStringOption((o) => o.setName('text').setDescription('Text to translate').setRequired(true).setMaxLength(1500))
    .addStringOption((o) => o.setName('to').setDescription('Target language').setRequired(true).addChoices(...LANG_CHOICES.slice(0, 25)))
    .addBooleanOption((o) => o.setName('private').setDescription('Only you can see the result (default: false)').setRequired(false)) as unknown as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction | ContextMenuCommandInteraction, ctx: AddonContext) {
    if (!interaction.isChatInputCommand()) return;
    const loc = await ctx.resolveLocale(interaction);
    if (!isTranslateAvailable()) {
      await interaction.reply({ content: ctx.t('unavailable', loc), flags: MessageFlags.Ephemeral });
      return;
    }
    const cd = cooldown(interaction.user.id);
    if (cd) {
      await interaction.reply({ content: ctx.t('cooldown', loc, { seconds: cd }), flags: MessageFlags.Ephemeral });
      return;
    }

    const text = interaction.options.getString('text', true);
    const target = interaction.options.getString('to', true);
    const priv = interaction.options.getBoolean('private') ?? false;
    await interaction.deferReply(priv ? { flags: MessageFlags.Ephemeral } : {});
    try {
      const { text: out, detected } = await translate(text, target);
      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .addFields(
          { name: ctx.t('fieldFrom', loc, { lang: langName(detected) }), value: text.slice(0, 1024) },
          { name: ctx.t('fieldTo', loc, { lang: langName(target) }), value: (out || '—').slice(0, 1024) },
        )
        .setFooter({ text: ctx.t('poweredBy', loc) });
      await interaction.editReply({ embeds: [embed] });
    } catch {
      await interaction.editReply({ content: ctx.t('failed', loc) });
    }
  },
};

export default command;
