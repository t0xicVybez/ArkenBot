import { describe, it, expect } from 'vitest';
import { canManageGuild } from '../../packages/api/src/utils/guildAccess.js';

/**
 * The dashboard access boundary: who is allowed to configure a server.
 * Getting this wrong either locks out legitimate admins or — far worse — lets
 * non-admins manage a server, so it is worth exhaustive coverage.
 */
const ADMINISTRATOR = (0x8).toString();     // "8"
const MANAGE_GUILD = (0x20).toString();     // "32"
const SEND_MESSAGES = (0x800).toString();   // "2048" — not a management perm

describe('canManageGuild', () => {
  it('grants the owner regardless of the permission bitfield', () => {
    expect(canManageGuild('0', true)).toBe(true);
    expect(canManageGuild('', true)).toBe(true);
  });

  it('grants Administrator', () => {
    expect(canManageGuild(ADMINISTRATOR, false)).toBe(true);
  });

  it('grants Manage Server', () => {
    expect(canManageGuild(MANAGE_GUILD, false)).toBe(true);
  });

  it('grants when the management bit is set among many others', () => {
    // Administrator (0x8) OR'd with a pile of unrelated permissions.
    const combined = (0x8n | 0x400n | 0x800n | 0x4000n).toString();
    expect(canManageGuild(combined, false)).toBe(true);
  });

  it('denies a non-owner with only non-management permissions', () => {
    expect(canManageGuild(SEND_MESSAGES, false)).toBe(false);
    expect(canManageGuild('0', false)).toBe(false);
  });

  it('denies a malformed bitfield instead of throwing', () => {
    expect(canManageGuild('not-a-number', false)).toBe(false);
    expect(canManageGuild('12.5', false)).toBe(false); // BigInt('12.5') throws → deny
  });

  it('handles a realistic full-admin Discord bitfield string', () => {
    // A typical "all permissions" bitfield includes Administrator.
    expect(canManageGuild('1099511627775', false)).toBe(true);
  });
});
