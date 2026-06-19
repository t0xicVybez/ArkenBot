import { createCanvas } from '@napi-rs/canvas';

export interface DayStats {
  date: Date;
  messagesCount: number;
  commandsCount: number;
  newMembers: number;
  leftMembers: number;
}

// ── Palette ───────────────────────────────────────────────────────────────────
const BG       = '#111214';
const SURFACE  = '#1a1d21';
const BORDER   = 'rgba(255,255,255,0.08)';
const BLUE     = '#5865f2';
const GREEN    = '#3ba55d';
const RED      = '#ed4245';
const TEXT     = '#f2f3f5';
const SUBTEXT  = '#72767d';
const GRID     = 'rgba(255,255,255,0.06)';
const BASELINE = 'rgba(255,255,255,0.12)';

// ── Helpers ───────────────────────────────────────────────────────────────────

type Ctx = ReturnType<ReturnType<typeof createCanvas>['getContext']>;

function padDays(stats: DayStats[], days = 30): DayStats[] {
  const map = new Map<string, DayStats>();
  for (const s of stats) map.set(s.date.toISOString().slice(0, 10), s);
  const result: DayStats[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000);
    const key = d.toISOString().slice(0, 10);
    result.push(map.get(key) ?? { date: d, messagesCount: 0, commandsCount: 0, newMembers: 0, leftMembers: 0 });
  }
  return result;
}

function shortDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

// Round up to a "nice" number for the y-axis ceiling.
function niceMax(raw: number): number {
  if (raw <= 0) return 5;
  const mag  = Math.pow(10, Math.floor(Math.log10(raw)));
  const frac = raw / mag;
  const nice = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10;
  return nice * mag;
}

// Choose integer y-axis steps that avoid duplicates.
function ySteps(max: number, steps = 4): number[] {
  const step = Math.max(1, Math.ceil(max / steps));
  const out: number[] = [0];
  for (let v = step; v <= max; v += step) out.push(v);
  return out;
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

// Bar rounded only on top.
function barPath(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const cr = Math.min(r, w / 2, Math.max(0, h));
  ctx.beginPath();
  if (h <= cr * 2) {
    // Very short bar — just a rounded rect.
    roundRect(ctx, x, y, w, Math.max(h, 2), cr);
  } else {
    ctx.moveTo(x, y + h);
    ctx.lineTo(x, y + cr);
    ctx.arcTo(x, y, x + cr, y, cr);
    ctx.lineTo(x + w - cr, y);
    ctx.arcTo(x + w, y, x + w, y + cr, cr);
    ctx.lineTo(x + w, y + h);
    ctx.closePath();
  }
}

// ── Chart drawing ─────────────────────────────────────────────────────────────

interface Series { label: string; color: string; values: number[] }

const CHART_PAD_L  = 52;   // room for y-axis labels
const CHART_PAD_R  = 20;
const CHART_PAD_T  = 48;   // room for title
const CHART_PAD_B  = 52;   // room for x-axis labels
const LEGEND_H     = 28;   // legend strip at the very bottom of the card

function drawChart(
  ctx: Ctx,
  cardX: number, cardY: number,
  cardW: number, cardH: number,
  title: string,
  labels: string[],
  series: Series[],
  labelEvery: number,
) {
  // ── Card ────────────────────────────────────────────────────────────────────
  ctx.fillStyle = SURFACE;
  roundRect(ctx, cardX, cardY, cardW, cardH, 12);
  ctx.fill();
  ctx.strokeStyle = BORDER;
  ctx.lineWidth = 1;
  roundRect(ctx, cardX, cardY, cardW, cardH, 12);
  ctx.stroke();

  // ── Title ────────────────────────────────────────────────────────────────────
  ctx.fillStyle = TEXT;
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(title, cardX + CHART_PAD_L, cardY + 30);

  // ── Plot area ────────────────────────────────────────────────────────────────
  const plotX = cardX + CHART_PAD_L;
  const plotW = cardW - CHART_PAD_L - CHART_PAD_R;
  const plotY = cardY + CHART_PAD_T;
  const plotH = cardH - CHART_PAD_T - CHART_PAD_B - LEGEND_H;
  const plotBottom = plotY + plotH;

  const maxVal  = niceMax(Math.max(1, ...series.flatMap(s => s.values)));
  const steps   = ySteps(maxVal);

  // Grid lines + y-axis labels
  for (const step of steps) {
    const gy = plotBottom - (step / maxVal) * plotH;

    ctx.strokeStyle = step === 0 ? BASELINE : GRID;
    ctx.lineWidth   = step === 0 ? 1.5 : 1;
    ctx.setLineDash(step === 0 ? [] : [4, 6]);
    ctx.beginPath();
    ctx.moveTo(plotX, gy);
    ctx.lineTo(plotX + plotW, gy);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle  = SUBTEXT;
    ctx.font       = '11px sans-serif';
    ctx.textAlign  = 'right';
    ctx.fillText(String(step), plotX - 8, gy + 4);
  }

  // ── Bars ─────────────────────────────────────────────────────────────────────
  const n        = labels.length;
  const groupW   = plotW / n;
  const gap      = 1.5;
  const barW     = Math.max(3, (groupW * 0.72) / series.length - gap);

  for (let i = 0; i < n; i++) {
    const gx       = plotX + i * groupW;
    const totalBarsW = series.length * barW + (series.length - 1) * gap;
    const barStart = gx + (groupW - totalBarsW) / 2;

    for (let si = 0; si < series.length; si++) {
      const val = series[si].values[i] ?? 0;
      if (val === 0) continue;
      const bh  = Math.max(3, (val / maxVal) * plotH);
      const bx  = barStart + si * (barW + gap);
      const by  = plotBottom - bh;

      // Subtle glow / alpha layering for depth
      ctx.globalAlpha = 0.15;
      ctx.fillStyle   = series[si].color;
      barPath(ctx, bx - 1, by + 2, barW + 2, bh, 4);
      ctx.fill();

      ctx.globalAlpha = 1;
      ctx.fillStyle   = series[si].color;
      barPath(ctx, bx, by, barW, bh, 4);
      ctx.fill();
    }

    // X-axis label — only every nth day, plus always the last
    if (i % labelEvery === 0 || i === n - 1) {
      ctx.fillStyle  = SUBTEXT;
      ctx.font       = '11px sans-serif';
      ctx.textAlign  = 'center';
      ctx.fillText(labels[i], gx + groupW / 2, plotBottom + 20);
    }
  }

  // ── Legend (bottom strip of card) ────────────────────────────────────────────
  const legendY    = cardY + cardH - LEGEND_H + 4;
  const dotR       = 5;
  const itemWidths = series.map(s => {
    ctx.font = '12px sans-serif';
    return dotR * 2 + 6 + ctx.measureText(s.label).width;
  });
  const totalLegendW = itemWidths.reduce((a, b) => a + b, 0) + (series.length - 1) * 20;
  let lx = cardX + cardW / 2 - totalLegendW / 2;

  // Subtle divider above legend
  ctx.strokeStyle = BORDER;
  ctx.lineWidth   = 1;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(cardX + 16, legendY - 8);
  ctx.lineTo(cardX + cardW - 16, legendY - 8);
  ctx.stroke();

  for (let si = 0; si < series.length; si++) {
    const s = series[si];
    // Filled circle dot
    ctx.fillStyle = s.color;
    ctx.beginPath();
    ctx.arc(lx + dotR, legendY + dotR, dotR, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle  = TEXT;
    ctx.font       = '12px sans-serif';
    ctx.textAlign  = 'left';
    ctx.fillText(s.label, lx + dotR * 2 + 6, legendY + dotR + 4);
    lx += itemWidths[si] + 20;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function generateAnalyticsImage(rawStats: DayStats[]): Promise<Buffer> {
  const stats      = padDays(rawStats, 30);
  const labels     = stats.map(s => shortDate(s.date));
  const labelEvery = Math.max(1, Math.ceil(stats.length / 8));

  const W       = 900;
  const CARD_H  = 295;
  const GAP     = 14;
  const PAD     = 18;
  const H       = PAD + CARD_H + GAP + CARD_H + PAD;

  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  // Outer background
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  const cardW = W - PAD * 2;

  drawChart(
    ctx,
    PAD, PAD,
    cardW, CARD_H,
    'Activity (30 days)',
    labels,
    [
      { label: 'Messages', color: BLUE,  values: stats.map(s => s.messagesCount) },
      { label: 'Commands', color: GREEN, values: stats.map(s => s.commandsCount) },
    ],
    labelEvery,
  );

  drawChart(
    ctx,
    PAD, PAD + CARD_H + GAP,
    cardW, CARD_H,
    'Member Flow (30 days)',
    labels,
    [
      { label: 'Joins',  color: GREEN, values: stats.map(s => s.newMembers) },
      { label: 'Leaves', color: RED,   values: stats.map(s => s.leftMembers) },
    ],
    labelEvery,
  );

  return canvas.toBuffer('image/png');
}
