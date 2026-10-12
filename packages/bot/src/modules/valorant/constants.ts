
// Valorant rank reference data and helpers. TIER_NAMES is indexed by Riot's
// numeric competitive tier (0 = Unranked … 27 = Radiant); the tier* helpers
// turn a tier number into a display name/base/colour, and the *Host helpers map
// a region to the correct regional Riot API hostname.
export const TIER_NAMES: string[] = [
  'Unranked', 'Unranked', 'Unranked',
  'Iron 1', 'Iron 2', 'Iron 3',
  'Bronze 1', 'Bronze 2', 'Bronze 3',
  'Silver 1', 'Silver 2', 'Silver 3',
  'Gold 1', 'Gold 2', 'Gold 3',
  'Platinum 1', 'Platinum 2', 'Platinum 3',
  'Diamond 1', 'Diamond 2', 'Diamond 3',
  'Ascendant 1', 'Ascendant 2', 'Ascendant 3',
  'Immortal 1', 'Immortal 2', 'Immortal 3',
  'Radiant',
];

export function tierBase(tier: number): string {
  return (TIER_NAMES[tier] ?? 'Unranked').replace(/\s*\d+$/, '');
}

export function tierName(tier: number | null | undefined): string {
  return typeof tier === 'number' ? (TIER_NAMES[tier] ?? 'Unranked') : 'Unranked';
}

export function tierColor(tier: number | null | undefined): number {
  const b = tierBase(tier ?? 0);
  const map: Record<string, number> = {
    Unranked: 0x4b5563, Iron: 0x5a5a5a, Bronze: 0xa1683a, Silver: 0xc0c7cf, Gold: 0xe6c15a,
    Platinum: 0x39a0a8, Diamond: 0xb072d1, Ascendant: 0x2fae62, Immortal: 0xc0436d, Radiant: 0xfff5b8,
  };
  return map[b] ?? 0xff4655;
}

export function valHost(region: string): string {
  const r = (region || 'na').toLowerCase();
  if (['eu', 'europe', 'euw', 'eune'].includes(r)) return 'eu';
  if (['ap', 'asia'].includes(r)) return 'ap';
  if (['kr', 'korea'].includes(r)) return 'kr';
  if (r === 'latam') return 'latam';
  if (r === 'br') return 'br';
  return 'na';
}

export function accountHost(region: string): string {
  const r = (region || 'na').toLowerCase();
  if (['eu', 'europe', 'euw', 'eune'].includes(r)) return 'europe';
  if (['ap', 'asia', 'kr', 'korea'].includes(r)) return 'asia';
  return 'americas';
}
