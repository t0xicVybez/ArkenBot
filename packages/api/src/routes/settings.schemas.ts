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
  banNetworkEnabled:       z.boolean().optional(),
  banNetworkContribute:    z.boolean().optional(),
  banNetworkAction:        z.enum(['alert', 'ban']).optional(),
  banNetworkThreshold:     z.number().int().min(1).max(50).optional(),
  banNetworkChannelId:     z.string().nullable().optional(),
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
 * Common Discord emoji shortcodes people type into the emoji field (e.g. `:one:`)
 * mapped to the actual Unicode emoji. Discord's REST API can only react with a
 * real Unicode/custom emoji — the `:name:` shortcode is a client-only rendering,
 * so a stored shortcode produces a panel with no reactable emoji. We convert the
 * ones people actually use for reaction-role panels; regional-indicator letters
 * are generated below.
 */
const EMOJI_SHORTCODES: Record<string, string> = {
  zero: '0️⃣', one: '1️⃣', two: '2️⃣', three: '3️⃣', four: '4️⃣',
  five: '5️⃣', six: '6️⃣', seven: '7️⃣', eight: '8️⃣', nine: '9️⃣', ten: '🔟',
  keycap_ten: '🔟', hash: '#️⃣', asterisk: '*️⃣',
  white_check_mark: '✅', heavy_check_mark: '✔️', ballot_box_with_check: '☑️',
  x: '❌', negative_squared_cross_mark: '❎', o: '⭕', red_circle: '🔴',
  green_circle: '🟢', blue_circle: '🔵', yellow_circle: '🟡', orange_circle: '🟠',
  purple_circle: '🟣', brown_circle: '🟤', black_circle: '⚫', white_circle: '⚪',
  star: '⭐', star2: '🌟', sparkles: '✨', fire: '🔥', boom: '💥', zap: '⚡',
  tada: '🎉', confetti_ball: '🎊', gift: '🎁', balloon: '🎈', crown: '👑', gem: '💎',
  heart: '❤️', orange_heart: '🧡', yellow_heart: '💛', green_heart: '💚',
  blue_heart: '💙', purple_heart: '💜', black_heart: '🖤', white_heart: '🤍',
  thumbsup: '👍', '+1': '👍', thumbsdown: '👎', '-1': '👎', wave: '👋', eyes: '👀',
  bell: '🔔', lock: '🔒', key: '🔑', gear: '⚙️', shield: '🛡️', tools: '🛠️',
  warning: '⚠️', question: '❓', grey_question: '❔', exclamation: '❗',
  bulb: '💡', rocket: '🚀', crystal_ball: '🔮', game_die: '🎲', video_game: '🎮',
  musical_note: '🎵', headphones: '🎧', microphone: '🎤', art: '🎨',
  robot: '🤖', ghost: '👻', alien: '👽', skull: '💀', dog: '🐶', cat: '🐱',
  speech_balloon: '💬', pushpin: '📌', calendar: '📅', clipboard: '📋', label: '🏷️',
};

/**
 * Normalise an emoji string to the canonical form used by Discord.js reaction events:
 *   - Custom emoji <:name:id> or <a:name:id>  → "name:id"
 *   - `:shortcode:` (e.g. `:one:`) → the actual Unicode emoji
 *   - Unicode emoji → the variation selector (U+FE0F) stripped, matching the bot's
 *     `emojiKey()`; the keycap mark (U+20E3) is KEPT so keycaps like `1️⃣` still match.
 */
export function normalizeEmoji(raw: string): string {
  let value = raw.trim();

  const custom = value.match(/^<a?:([\w~]+):(\d+)>$/);
  if (custom) return `${custom[1]}:${custom[2]}`;

  // Resolve a :shortcode: (regional_indicator_a → 🇦, or the table above).
  const shortcode = value.match(/^:([a-z0-9_+-]+):$/i);
  if (shortcode) {
    const key = shortcode[1].toLowerCase();
    const ri = key.match(/^regional_indicator_([a-z])$/);
    if (ri) value = String.fromCodePoint(0x1f1e6 + (ri[1].charCodeAt(0) - 97));
    else if (EMOJI_SHORTCODES[key]) value = EMOJI_SHORTCODES[key];
    // An unknown shortcode is left as-is; it won't be reactable, which the bot
    // now surfaces as an alert rather than failing silently.
  }

  // Strip only the U+FE0F variation selector and E0100-range tags, matching
  // emojiKey() on the bot side so stored and reacted forms are identical.
  return value
    .replace(/️/g, '')
    .replace(/\uDB40[\uDC00-\uDCFF]/g, '')
    .trim();
}
