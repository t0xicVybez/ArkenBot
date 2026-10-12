/**
 * Decodes Discord permission bitfields to decide whether a user may manage a guild (Administrator or Manage Server, or being the owner).
 */
const ADMINISTRATOR = 0x8n;
const MANAGE_GUILD = 0x20n;

export function canManageGuild(permissions: string, owner: boolean): boolean {
  if (owner) return true;
  let perms: bigint;
  try {
    perms = BigInt(permissions);
  } catch {
    return false;
  }
  return (perms & ADMINISTRATOR) === ADMINISTRATOR || (perms & MANAGE_GUILD) === MANAGE_GUILD;
}
