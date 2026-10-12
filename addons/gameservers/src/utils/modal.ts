
import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
import { PALWORLD_REST_PORT } from '../query.js';

export const CREDENTIAL_MODAL_PREFIX = 'gs:cred:';
export const FIELD_PASSWORD = 'password';
export const FIELD_QUERY_PORT = 'queryport';

type Translate = (key: string, vars?: Record<string, string | number>) => string;

export function buildCredentialModal(action: 'add' | 'status', gameLabel: string, t: Translate): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`${CREDENTIAL_MODAL_PREFIX}${action}`)
    .setTitle(t('modalTitle', { game: gameLabel }).slice(0, 45))
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId(FIELD_PASSWORD)
          .setLabel('AdminPassword')
          .setPlaceholder('The AdminPassword from PalWorldSettings.ini')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(200),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId(FIELD_QUERY_PORT)
          .setLabel(t('modalPortLabel'))
          .setPlaceholder(String(PALWORLD_REST_PORT))
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(5),
      ),
    );
}
