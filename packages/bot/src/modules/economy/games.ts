/**
 * Pure, deterministic-when-seeded game resolvers for /gamble and /blackjack.
 *
 * Every function takes an injectable `rng` (defaults to Math.random) so the exact
 * odds can be measured by Monte-Carlo tests (see tests/bot/games.sim.test.ts).
 *
 * House edges are applied honestly through payout structure (like a real casino),
 * never by rigging the roll:
 *   - Even-money games (coinflip, dice, high/low) pay a 5% commission on winnings
 *     (0.95 : 1), the classic baccarat-style edge → ~2–3% house edge.
 *   - Roulette uses authentic single-zero European payouts → 2.70% edge.
 *   - Slots is tuned via its paytable → ~5% edge.
 *   - Blackjack is authentic (dealer stands on 17, blackjack pays 3:2); its edge
 *     depends on how the player hits/stands.
 */

export type Rng = () => number;

/** Even-money win pays 0.95 : 1 (5% house commission on the profit). */
export const EVEN_MONEY_PAYOUT = 0.95;

/** Profit paid on an even-money win of `bet`, floored to whole currency. */
const evenWin = (bet: number): number => Math.max(0, Math.floor(bet * EVEN_MONEY_PAYOUT));

const die = (sides: number, rng: Rng): number => 1 + Math.floor(rng() * sides);

// ─── Coinflip ────────────────────────────────────────────────────────────────
export interface CoinflipResult { flip: 'heads' | 'tails'; won: boolean; delta: number; }
export function coinflip(bet: number, side: 'heads' | 'tails', rng: Rng = Math.random): CoinflipResult {
  const flip: 'heads' | 'tails' = rng() < 0.5 ? 'heads' : 'tails';
  const won = flip === side;
  return { flip, won, delta: won ? evenWin(bet) : -bet };
}

// ─── Dice: your 2d6 vs the house's 2d6, tie pushes ─────────────────────────────
export interface DiceResult { you: number; house: number; tie: boolean; won: boolean; delta: number; }
export function dice(bet: number, rng: Rng = Math.random): DiceResult {
  const you = die(6, rng) + die(6, rng);
  const house = die(6, rng) + die(6, rng);
  const tie = you === house;
  const won = you > house;
  return { you, house, tie, won, delta: tie ? 0 : won ? evenWin(bet) : -bet };
}

// ─── Higher / Lower: base 1–100, next 1–100 (ties rerolled) ────────────────────
export interface HighlowResult { base: number; next: number; won: boolean; delta: number; }
export function highlow(bet: number, guess: 'higher' | 'lower', rng: Rng = Math.random): HighlowResult {
  const base = die(100, rng);
  let next = die(100, rng);
  while (next === base) next = die(100, rng); // never a tie
  const won = guess === 'higher' ? next > base : next < base;
  return { base, next, won, delta: won ? evenWin(bet) : -bet };
}

// ─── Roulette: authentic European wheel (18 red / 18 black / 1 green) ───────────
export type RouletteColor = 'red' | 'black' | 'green';
export interface RouletteResult { valid: boolean; pocket: number; color: RouletteColor; won: boolean; delta: number; }
export function roulette(bet: number, raw: string, rng: Rng = Math.random): RouletteResult {
  const r = raw.trim().toLowerCase();
  const asNum = /^\d+$/.test(r) ? parseInt(r, 10) : null;
  const isColor = r === 'red' || r === 'black' || r === 'green';
  if ((asNum === null || asNum < 0 || asNum > 36) && !isColor) {
    return { valid: false, pocket: -1, color: 'green', won: false, delta: 0 };
  }
  const pocket = Math.floor(rng() * 37); // 0–36, uniform → 2.70% edge on every bet
  const color: RouletteColor = pocket === 0 ? 'green' : pocket % 2 === 0 ? 'black' : 'red';
  let won = false;
  let mult = -1;
  if (asNum !== null) { won = pocket === asNum; mult = won ? 35 : -1; }        // straight-up 35:1
  else if (r === 'green') { won = color === 'green'; mult = won ? 35 : -1; }   // the single zero, 35:1
  else { won = color === r; mult = won ? 1 : -1; }                             // red/black 1:1
  return { valid: true, pocket, color, won, delta: bet * mult };
}

// ─── Slots: 3 reels of 6 symbols; paytable tuned to ~5% house edge ─────────────
export const SLOT_SYMBOLS = ['🍒', '🍋', '🍊', '🍇', '🔔', '💎'] as const;
export interface SlotsResult { reels: string[]; won: boolean; delta: number; }
export function slots(bet: number, rng: Rng = Math.random): SlotsResult {
  const reels = [0, 1, 2].map(() => SLOT_SYMBOLS[Math.floor(rng() * SLOT_SYMBOLS.length)]);
  const [a, b, c] = reels;
  let delta: number;
  if (a === b && b === c) delta = bet * (a === '💎' ? 9 : 4);       // triple (jackpot on diamonds)
  else if (a === b || b === c || a === c) delta = Math.floor(bet * 0.9); // any pair pays 0.9 : 1
  else delta = -bet;                                                 // no match
  return { reels, won: delta > 0, delta };
}

// ─── Blackjack ─────────────────────────────────────────────────────────────────
export interface Card { rank: string; suit: string; }
const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

export function freshDeck(rng: Rng = Math.random): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) for (const rank of RANKS) deck.push({ rank, suit });
  for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  return deck;
}

/** Best hand total, treating aces as 11 then demoting to 1 to avoid busting. */
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

/** Dealer draws until 17+ (stands on soft 17). Mutates the hand from the deck. */
export function dealerPlay(dealer: Card[], deck: Card[]): void {
  while (handValue(dealer) < 17) dealer.push(deck.pop()!);
}

/** Net wallet change for a finished hand (player already had `bet` debited). */
export function blackjackPayout(playerCards: Card[], dealerCards: Card[], bet: number): number {
  const pv = handValue(playerCards), dv = handValue(dealerCards);
  const natural = pv === 21 && playerCards.length === 2;
  if (pv > 21) return -bet;                                    // player busts
  if (dv > 21 || pv > dv) return natural ? Math.floor(bet * 1.5) : bet; // win (blackjack pays 3:2)
  if (pv === dv) return 0;                                     // push
  return -bet;                                                 // dealer wins
}
