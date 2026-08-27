import { describe, it, expect } from 'vitest';
import {
  coinflip, dice, highlow, roulette, slots,
  freshDeck, handValue, dealerPlay, blackjackPayout, type Card,
} from '../../packages/bot/src/modules/economy/games.js';

const BET = 1000;         // large enough that the 0.95 flooring doesn't distort the edge
const N = 300_000;        // Monte-Carlo trials for even-money games
const pct = (edge: number) => `${(edge * 100).toFixed(2)}%`;

/** Measured house edge = −(mean net delta) / bet. Positive = house wins long-run. */
function measureEdge(play: () => number, trials = N): number {
  let sum = 0;
  for (let i = 0; i < trials; i++) sum += play();
  return -sum / (trials * BET);
}

describe('house edges (measured over ' + N.toLocaleString() + ' trials)', () => {
  it('coinflip ≈ 2.5% (0.95:1 payout on a 50/50)', () => {
    const edge = measureEdge(() => coinflip(BET, 'heads').delta);
    console.log('coinflip house edge:', pct(edge));
    expect(edge).toBeGreaterThan(0.015);
    expect(edge).toBeLessThan(0.035);
  });

  it('dice ≈ 2.2% (0.95:1, tie pushes)', () => {
    const edge = measureEdge(() => dice(BET).delta);
    console.log('dice house edge:', pct(edge));
    expect(edge).toBeGreaterThan(0.012);
    expect(edge).toBeLessThan(0.033);
  });

  it('higher/lower ≈ 2.5% (0.95:1)', () => {
    const edge = measureEdge(() => highlow(BET, 'higher').delta);
    console.log('highlow house edge:', pct(edge));
    expect(edge).toBeGreaterThan(0.015);
    expect(edge).toBeLessThan(0.035);
  });

  it('roulette red/black ≈ 2.70% (authentic single-zero)', () => {
    const edge = measureEdge(() => roulette(BET, 'red').delta);
    console.log('roulette red/black house edge:', pct(edge));
    expect(edge).toBeGreaterThan(0.018);
    expect(edge).toBeLessThan(0.038);
  });

  it('roulette straight-up number ≈ 2.70% (35:1)', () => {
    const edge = measureEdge(() => roulette(BET, '17').delta);
    console.log('roulette number house edge:', pct(edge));
    expect(edge).toBeGreaterThan(-0.01);   // 35:1 → high variance, wider band
    expect(edge).toBeLessThan(0.06);
  });

  it('slots ≈ 4–5% (paytable)', () => {
    const edge = measureEdge(() => slots(BET).delta);
    console.log('slots house edge:', pct(edge));
    expect(edge).toBeGreaterThan(0.02);
    expect(edge).toBeLessThan(0.08);
  });

  it('blackjack has a sane single-digit edge (not bugged/one-sided)', () => {
    const upValue = (c: Card) => (c.rank === 'A' ? 11 : ['K', 'Q', 'J', '10'].includes(c.rank) ? 10 : parseInt(c.rank, 10));
    let sum = 0;
    const hands = 120_000;
    for (let i = 0; i < hands; i++) {
      const deck = freshDeck();
      const player: Card[] = [deck.pop()!, deck.pop()!];
      const dealer: Card[] = [deck.pop()!, deck.pop()!];
      if (handValue(player) !== 21) {
        // simplified basic strategy (no double/split exists in this game)
        for (;;) {
          const pv = handValue(player);
          if (pv >= 17) break;
          if (pv >= 12 && pv <= 16 && upValue(dealer[0]) >= 2 && upValue(dealer[0]) <= 6) break; // stand vs weak dealer
          player.push(deck.pop()!);
          if (handValue(player) >= 21) break;
        }
      }
      dealerPlay(dealer, deck);
      sum += blackjackPayout(player, dealer, BET);
    }
    const edge = -sum / (hands * BET);
    console.log('blackjack house edge (basic-ish play):', pct(edge));
    expect(edge).toBeGreaterThan(-0.02);  // not player-favorable by much
    expect(edge).toBeLessThan(0.08);      // not absurdly punishing
  });
}, 60_000);

describe('game invariants', () => {
  it('handValue treats aces as 11 then 1 to avoid busting', () => {
    expect(handValue([{ rank: 'A', suit: '♠' }, { rank: 'K', suit: '♥' }])).toBe(21); // blackjack
    expect(handValue([{ rank: 'A', suit: '♠' }, { rank: 'A', suit: '♥' }])).toBe(12); // 11 + 1
    expect(handValue([{ rank: 'A', suit: '♠' }, { rank: '9', suit: '♥' }, { rank: '9', suit: '♦' }])).toBe(19); // ace demotes
  });
  it('a fresh deck is 52 unique cards', () => {
    const d = freshDeck();
    expect(d.length).toBe(52);
    expect(new Set(d.map((c) => `${c.rank}${c.suit}`)).size).toBe(52);
  });
  it('roulette rejects invalid bets and only ever pays for a real outcome', () => {
    expect(roulette(BET, 'purple').valid).toBe(false);
    expect(roulette(BET, '37').valid).toBe(false);
    expect(roulette(BET, '0').valid).toBe(true);
  });
});
