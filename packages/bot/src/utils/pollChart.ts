import { createCanvas } from '@napi-rs/canvas';

export async function generatePollChart(
  question: string,
  options: string[],
  votes: { optionIndex: number }[],
): Promise<Buffer> {
  const BAR_HEIGHT = 40;
  const BAR_GAP = 16;
  const PADDING = { top: 70, right: 30, bottom: 30, left: 220 };
  const CHART_WIDTH = 700;

  const total = votes.length;
  const counts = options.map((_, i) => votes.filter((v) => v.optionIndex === i).length);
  const maxCount = Math.max(...counts, 1);

  const chartHeight = options.length * (BAR_HEIGHT + BAR_GAP) - BAR_GAP;
  const canvasHeight = PADDING.top + chartHeight + PADDING.bottom;
  const canvasWidth = PADDING.left + CHART_WIDTH + PADDING.right;

  const canvas = createCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#1e1f22';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Title
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 18px sans-serif';
  ctx.textAlign = 'center';
  const maxTitleWidth = canvasWidth - 40;
  let title = question;
  if (ctx.measureText(title).width > maxTitleWidth) {
    while (ctx.measureText(title + '…').width > maxTitleWidth && title.length > 0) {
      title = title.slice(0, -1);
    }
    title += '…';
  }
  ctx.fillText(title, canvasWidth / 2, 36);

  ctx.fillStyle = '#5865f2';
  ctx.fillRect(40, 46, canvasWidth - 80, 2);

  const PALETTE = ['#5865f2', '#57f287', '#fee75c', '#ed4245', '#eb459e', '#3ba55c', '#faa61a', '#2f3136', '#99aab5', '#ffffff'];

  options.forEach((opt, i) => {
    const y = PADDING.top + i * (BAR_HEIGHT + BAR_GAP);
    const count = counts[i];
    const pct = total > 0 ? (count / total) * 100 : 0;
    const barWidth = Math.max(4, (count / maxCount) * CHART_WIDTH);
    const color = PALETTE[i % PALETTE.length];

    // Label
    ctx.fillStyle = '#b5bac1';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'right';
    const labelMaxW = PADDING.left - 12;
    let label = opt;
    while (ctx.measureText(label).width > labelMaxW && label.length > 0) {
      label = label.slice(0, -1);
    }
    if (label !== opt) label = label.slice(0, -1) + '…';
    ctx.fillText(label, PADDING.left - 8, y + BAR_HEIGHT / 2 + 5);

    // Bar background
    ctx.fillStyle = '#2b2d31';
    ctx.beginPath();
    roundRect(ctx, PADDING.left, y, CHART_WIDTH, BAR_HEIGHT, 6);
    ctx.fill();

    // Bar fill
    ctx.fillStyle = color;
    ctx.beginPath();
    roundRect(ctx, PADDING.left, y, barWidth, BAR_HEIGHT, 6);
    ctx.fill();

    // Count + percent label
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(
      `${count} vote${count !== 1 ? 's' : ''} (${Math.round(pct)}%)`,
      PADDING.left + barWidth + 8,
      y + BAR_HEIGHT / 2 + 5,
    );
  });

  // Footer
  ctx.fillStyle = '#72767d';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`Total votes: ${total}`, canvasWidth / 2, canvasHeight - 8);

  return canvas.toBuffer('image/png');
}

function roundRect(
  ctx: ReturnType<ReturnType<typeof createCanvas>['getContext']>,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
