/**
 * Guild dashboard access check.
 *
 * A user may manage a server's settings if they are its owner, or hold the
 * Administrator or Manage Server permission there — the standard "can configure
 * this server" threshold. `permissions` is the Discord permission bitfield as a
 * decimal string (from `/users/@me/guilds`).
 *
 * Pure and side-effect-free so the access boundary can be unit-tested.
 */
const ADMINISTRATOR = 0x8n;
const MANAGE_GUILD = 0x20n;

export function canManageGuild(permissions: string, owner: boolean): boolean {
  if (owner) return true;
  let perms: bigint;
  try {
    perms = BigInt(permissions);
  } catch {
    return false; // malformed bitfield → deny
  }
  return (perms & ADMINISTRATOR) === ADMINISTRATOR || (perms & MANAGE_GUILD) === MANAGE_GUILD;
}
