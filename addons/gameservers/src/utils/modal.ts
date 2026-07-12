/**
 * Modal used to collect a server's admin password.
 *
 * Discord renders slash command arguments in the channel for everyone to see, so
 * a password can never be a command option — it is collected here instead.
 */
import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
import { PALWORLD_REST_PORT } from '../query.js';

export const CREDENTIAL_MODAL_PREFIX = 'gs:cred:';
export const FIELD_PASSWORD = 'password';
export const FIELD_QUERY_PORT = 'queryport';

/** Builds the credential modal for an `add` or one-off `status` lookup. */
export function buildCredentialModal(action: 'add' | 'status', gameLabel: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`${CREDENTIAL_MODAL_PREFIX}${action}`)
    .setTitle(`${gameLabel} — admin password`.slice(0, 45))
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
          .setLabel('REST API port (optional)')
          .setPlaceholder(String(PALWORLD_REST_PORT))
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(5),
      ),
    );
}
