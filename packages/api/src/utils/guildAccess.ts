
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
