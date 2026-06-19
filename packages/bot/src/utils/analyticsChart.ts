import { createCanvas } from '@napi-rs/canvas';

export interface DayStats {
  date: Date;
  messagesCount: number;
  commandsCount: number;
  newMembers: number;
  leftMembers: number;
}

const BG       = '#16181a';
const SURFACE  = '#1e2124';
const BORDER   = '#2b2d31';
const BLUE     = '#5865f2';
const GREEN    = '#57f287';
const RED      = '#ed4245';
const TEXT     = '#f2f3f5';
const SUBTEXT  = '#8e9297';
const GRID     = 'rgba(255,255,255,0.05)';

// Fill the last 30 days, zero-filling any missing dates.
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

// Draw a rounded rectangle.
function roundRect(
  ctx: ReturnType<ReturnType<typeof createCanvas>['getContext']>,
  x: number, y: number, w: number, h: number, r: number,
) {
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

// Draw a bar that is rounded only at the top.
function barPath(
  ctx: ReturnType<ReturnType<typeof createCanvas>['getContext']>,
  x: number, y: number, w: number, h: number, r: number,
) {
  const cr = Math.min(r, w / 2, h);
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y + cr);
  ctx.arcTo(x, y, x + cr, y, cr);
  ctx.lineTo(x + w - cr, y);
  ctx.arcTo(x + w, y, x + w, y + cr, cr);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
}

interface Series {
  label: string;
  color: string;
  values: number[];
}

function drawChart(
  ctx: ReturnType<ReturnType<typeof createCanvas>['getContext']>,
  x0: number, y0: number,
  w: number, h: number,
  title: string,
  labels: string[],
  series: Series[],
  labelEvery: number,
) {
  const plotH = h - 55; // space for x-labels + legend below
  const plotY = y0 + 30; // space for title above

  // Card background
  ctx.fillStyle = SURFACE;
  roundRect(ctx, x0, y0, w, h, 10);
  ctx.fill();

  ctx.strokeStyle = BORDER;
  ctx.lineWidth = 1;
  roundRect(ctx, x0, y0, w, h, 10);
  ctx.stroke();

  // Title
  ctx.fillStyle = TEXT;
  ctx.font = 'bold 15px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(title, x0 + 16, y0 + 20);

  const maxVal = Math.max(1, ...series.flatMap(s => s.values));

  // Grid & Y-axis labels
  const gridSteps = 4;
  const yAxisW = 36;
  const plotX = x0 + yAxisW;
  const plotW = w - yAxisW - 12;

  for (let g = 0; g <= gridSteps; g++) {
    const gy = plotY + plotH - (g / gridSteps) * plotH;
    ctx.strokeStyle = GRID;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.moveTo(plotX, gy);
    ctx.lineTo(plotX + plotW, gy);
    ctx.stroke();
    ctx.setLineDash([]);

    const val = Math.round((g / gridSteps) * maxVal);
    ctx.fillStyle = SUBTEXT;
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(String(val), plotX - 4, gy + 4);
  }

  // Bars
  const n = labels.length;
  const groupW = plotW / n;
  const totalBarW = groupW * 0.7;
  const barW = Math.max(2, totalBarW / series.length - 2);

  for (let i = 0; i < n; i++) {
    const gx = plotX + i * groupW;
    const barAreaX = gx + (groupW - series.length * (barW + 2)) / 2;

    for (let si = 0; si < series.length; si++) {
      const val = series[si].values[i] ?? 0;
      if (val === 0) continue;
      const bh = Math.max(2, (val / maxVal) * plotH);
      const bx = barAreaX + si * (barW + 2);
      const by = plotY + plotH - bh;
      ctx.fillStyle = series[si].color;
      barPath(ctx, bx, by, barW, bh, 3);
      ctx.fill();
    }

    // X-axis label
    if (i % labelEvery === 0 || i === n - 1) {
      ctx.fillStyle = SUBTEXT;
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(labels[i], gx + groupW / 2, plotY + plotH + 16);
    }
  }

  // Legend
  let lx = plotX;
  const ly = y0 + h - 16;
  for (const s of series) {
    ctx.fillStyle = s.color;
    roundRect(ctx, lx, ly - 8, 10, 10, 2);
    ctx.fill();
    ctx.fillStyle = SUBTEXT;
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(s.label, lx + 14, ly + 2);
    lx += ctx.measureText(s.label).width + 32;
  }
}

export async function generateAnalyticsImage(rawStats: DayStats[]): Promise<Buffer> {
  const stats = padDays(rawStats, 30);
  const labels = stats.map(s => shortDate(s.date));
  const labelEvery = Math.ceil(stats.length / 8);

  const W = 880;
  const H = 560;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  const PAD = 16;
  const chartH = (H - PAD * 3) / 2;

  drawChart(
    ctx,
    PAD, PAD,
    W - PAD * 2, chartH,
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
    PAD, PAD * 2 + chartH,
    W - PAD * 2, chartH,
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
