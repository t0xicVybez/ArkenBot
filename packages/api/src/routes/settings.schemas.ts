/**
 * Request-body validation schemas for the settings routes, plus the emoji
 * normaliser. Extracted from settings.ts so the validation rules — the gate that
 * every settings write passes through — can be unit-tested without a running
 * server or database.
 */
import { z } from 'zod';

export const autoModAction = z.enum(['delete', 'warn', 'mute', 'kick', 'ban']);

export const GuildSettingsPatchSchema = z.object({
  prefix:               z.string().min(1).max(5).optional(),
  locale:               z.string().max(10).optional(),
  timezone:             z.string().max(50).optional(),
  moderationEnabled:    z.boolean().optional(),
  autoModEnabled:       z.boolean().optional(),
  levelingEnabled:      z.boolean().optional(),
  welcomeEnabled:       z.boolean().optional(),
  loggingEnabled:       z.boolean().optional(),
  musicEnabled:         z.boolean().optional(),
  reactionRolesEnabled: z.boolean().optional(),
  highlightsEnabled:    z.boolean().optional(),
  highlightsChannelId:  z.string().nullable().optional(),
  voiceXpEnabled:       z.boolean().optional(),
  voiceXpPerMinute:     z.number().int().min(1).max(100).optional(),
  prestigeEnabled:      z.boolean().optional(),
  prestigeLevel:        z.number().int().min(10).max(1000).optional(),
  logChannelId:         z.string().nullable().optional(),
  modLogChannelId:      z.string().nullable().optional(),
  welcomeChannelId:     z.string().nullable().optional(),
  leaveChannelId:       z.string().nullable().optional(),
  levelUpChannelId:     z.string().nullable().optional(),
  muteRoleId:           z.string().nullable().optional(),
  autoRoleId:           z.string().nullable().optional(),
  memberRoleId:         z.string().nullable().optional(),
  permissionAlertsEnabled: z.boolean().optional(),
  permissionAlertRoleId:   z.string().nullable().optional(),
  appealsEnabled:          z.boolean().optional(),
  appealChannelId:         z.string().nullable().optional(),
  accentColor:          z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  musicColor:           z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  levelUpColor:         z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  giveawayColor:        z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  birthdayColor:        z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  starboardColor:       z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  moderationColor:      z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  reactionRolesColor:   z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  streamAlertColor:         z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  scheduledMessageColor:    z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  loggingColor:             z.string().regex(/^(#[0-9A-Fa-f]{6}|)$/).optional(),
  announcementColor:        z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
}).strict();

export const AutoModPatchSchema = z.object({
  antiSpamEnabled:         z.boolean().optional(),
  antiSpamThreshold:       z.number().int().min(2).max(50).optional(),
  antiSpamInterval:        z.number().int().min(1000).max(60000).optional(),
  antiSpamAction:          autoModAction.optional(),
  filterEnabled:           z.boolean().optional(),
  filteredWords:           z.array(z.string().max(100)).max(200).optional(),
  filterAction:            autoModAction.optional(),
  filterWarnBeforeTimeout: z.number().int().min(1).optional(),
  filterTimeoutDuration:   z.number().int().min(10).max(2419200).optional(),
  filterWarnBeforeKick:    z.number().int().min(1).optional(),
  filterWarnMessage:       z.string().max(500).optional(),
  filterKickMessage:       z.string().max(500).optional(),
  filterKickDMMessage:     z.string().max(500).optional(),
  antiLinkEnabled:         z.boolean().optional(),
  allowedDomains:          z.array(z.string().max(253)).max(50).optional(),
  linkAction:              autoModAction.optional(),
  antiMentionEnabled:      z.boolean().optional(),
  mentionThreshold:        z.number().int().min(1).max(50).optional(),
  antiCapsEnabled:         z.boolean().optional(),
  capsThreshold:           z.number().int().min(10).max(100).optional(),
  antiRaidEnabled:         z.boolean().optional(),
  raidThreshold:           z.number().int().min(2).max(100).optional(),
  raidInterval:            z.number().int().min(1000).max(30000).optional(),
  raidAction:              z.enum(['kick', 'lockdown']).optional(),
  minAccountAgeEnabled:    z.boolean().optional(),
  minAccountAgeHours:      z.number().int().min(1).max(8760).optional(),
  minAccountAgeAction:     z.enum(['kick', 'ban', 'alert', 'quarantine']).optional(),
  quarantineRoleId:        z.string().max(32).nullish(),
  newAccountFlagEnabled:   z.boolean().optional(),
  newAccountFlagHours:     z.number().int().min(1).max(8760).optional(),
  antiPhishingEnabled:     z.boolean().optional(),
  antiPhishingAction:      z.enum(['delete', 'delete_mute']).optional(),
  aiModEnabled:            z.boolean().optional(),
  aiModAction:             z.enum(['flag', 'delete']).optional(),
  exemptRoles:             z.array(z.string()).max(25).optional(),
  exemptChannels:          z.array(z.string()).max(50).optional(),
}).strict();

export const WelcomePatchSchema = z.object({
  welcomeEnabled:   z.boolean().optional(),
  welcomeChannelId: z.string().nullable().optional(),
  welcomeMessage:   z.string().max(2000).optional(),
  welcomeEmbed:     z.boolean().optional(),
  welcomeColor:     z.string().max(7).optional(),
  welcomeDMEnabled: z.boolean().optional(),
  welcomeDMMessage: z.string().max(2000).optional(),
  leaveEnabled:     z.boolean().optional(),
  leaveChannelId:   z.string().nullable().optional(),
  leaveMessage:     z.string().max(2000).optional(),
}).strict();

/**
 * Normalise an emoji string to the canonical form used by Discord.js reaction events:
 *   - Custom emoji <:name:id> or <a:name:id>  → "name:id"
 *   - Unicode emoji (possibly with FE0F variation selector) → stripped Unicode character
 */
export function normalizeEmoji(raw: string): string {
  const m = raw.match(/^<a?:([\w~]+):(\d+)>$/);
  if (m) return `${m[1]}:${m[2]}`;
  // Strip all Unicode variation selectors (U+FE00–U+FE0F, U+E0100–U+E01EF)
  // and keycap combining enclosing mark (U+20E3)
  return raw
    .replace(/[︀-️⃣]/g, '')
    .replace(/\uDB40[\uDC00-\uDCFF]/g, '') // U+E0100–U+E01EF (surrogate pair range)
    .trim();
}
