

export type Rng = () => number;

export const EVEN_MONEY_PAYOUT = 0.95;

const evenWin = (bet: number): number => Math.max(0, Math.floor(bet * EVEN_MONEY_PAYOUT));

const die = (sides: number, rng: Rng): number => 1 + Math.floor(rng() * sides);

export interface CoinflipResult { flip: 'heads' | 'tails'; won: boolean; delta: number; }
export function coinflip(bet: number, side: 'heads' | 'tails', rng: Rng = Math.random): CoinflipResult {
  const flip: 'heads' | 'tails' = rng() < 0.5 ? 'heads' : 'tails';
  const won = flip === side;
  return { flip, won, delta: won ? evenWin(bet) : -bet };
}

export interface DiceResult { you: number; house: number; tie: boolean; won: boolean; delta: number; }
export function dice(bet: number, rng: Rng = Math.random): DiceResult {
  const you = die(6, rng) + die(6, rng);
  const house = die(6, rng) + die(6, rng);
  const tie = you === house;
  const won = you > house;
  return { you, house, tie, won, delta: tie ? 0 : won ? evenWin(bet) : -bet };
}

export interface HighlowResult { base: number; next: number; won: boolean; delta: number; }
export function highlow(bet: number, guess: 'higher' | 'lower', rng: Rng = Math.random): HighlowResult {
  const base = die(100, rng);
  let next = die(100, rng);
  while (next === base) next = die(100, rng);
  const won = guess === 'higher' ? next > base : next < base;
  return { base, next, won, delta: won ? evenWin(bet) : -bet };
}

export type RouletteColor = 'red' | 'black' | 'green';
export interface RouletteResult { valid: boolean; pocket: number; color: RouletteColor; won: boolean; delta: number; }
export function roulette(bet: number, raw: string, rng: Rng = Math.random): RouletteResult {
  const r = raw.trim().toLowerCase();
  const asNum = /^\d+$/.test(r) ? parseInt(r, 10) : null;
  const isColor = r === 'red' || r === 'black' || r === 'green';
  if ((asNum === null || asNum < 0 || asNum > 36) && !isColor) {
    return { valid: false, pocket: -1, color: 'green', won: false, delta: 0 };
  }
  const pocket = Math.floor(rng() * 37);
  const color: RouletteColor = pocket === 0 ? 'green' : pocket % 2 === 0 ? 'black' : 'red';
  let won = false;
  let mult = -1;
  if (asNum !== null) { won = pocket === asNum; mult = won ? 35 : -1; }
  else if (r === 'green') { won = color === 'green'; mult = won ? 35 : -1; }
  else { won = color === r; mult = won ? 1 : -1; }
  return { valid: true, pocket, color, won, delta: bet * mult };
}

export const SLOT_SYMBOLS = ['🍒', '🍋', '🍊', '🍇', '🔔', '💎'] as const;
export interface SlotsResult { reels: string[]; won: boolean; delta: number; }
export function slots(bet: number, rng: Rng = Math.random): SlotsResult {
  const reels = [0, 1, 2].map(() => SLOT_SYMBOLS[Math.floor(rng() * SLOT_SYMBOLS.length)]);
  const [a, b, c] = reels;
  let delta: number;
  if (a === b && b === c) delta = bet * (a === '💎' ? 9 : 4);
  else if (a === b || b === c || a === c) delta = Math.floor(bet * 0.9);
  else delta = -bet;
  return { reels, won: delta > 0, delta };
}

export interface Card { rank: string; suit: string; }
const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

export function freshDeck(rng: Rng = Math.random): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) for (const rank of RANKS) deck.push({ rank, suit });
  for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  return deck;
}

export function handValue(hand: Card[]): number {
  let total = 0, aces = 0;
  for (const c of hand) {
    if (c.rank === 'A') { aces++; total += 11; }
    else if (c.rank === 'K' || c.rank === 'Q' || c.rank === 'J') total += 10;
    else total += parseInt(c.rank, 10);
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}

export function dealerPlay(dealer: Card[], deck: Card[]): void {
  while (handValue(dealer) < 17) dealer.push(deck.pop()!);
}

export function blackjackPayout(playerCards: Card[], dealerCards: Card[], bet: number): number {
  const pv = handValue(playerCards), dv = handValue(dealerCards);
  const natural = pv === 21 && playerCards.length === 2;
  if (pv > 21) return -bet;
  if (dv > 21 || pv > dv) return natural ? Math.floor(bet * 1.5) : bet;
  if (pv === dv) return 0;
  return -bet;
}
