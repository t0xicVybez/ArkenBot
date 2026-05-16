import { createCanvas, loadImage } from '@napi-rs/canvas';

export interface RankCardOptions {
  username: string;
  avatarUrl: string;
  rank: number;
  level: number;
  xpInLevel: number;
  xpNeeded: number;
  totalXp: number;
  totalMessages: number;
  // Style overrides
  accentColor?: string;
  backgroundUrl?: string;
}

function drawRoundRect(
  ctx: ReturnType<ReturnType<typeof createCanvas>['getContext']>,
  x: number, y: number, w: number, h: number, r: number,
): void {
  ctx.beginPath();
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

export async function generateRankCard(options: RankCardOptions): Promise<Buffer> {
  const W = 900;
  const H = 280;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  const accent = options.accentColor ?? '#5865f2';

  // Background
  if (options.backgroundUrl) {
    try {
      const bg = await loadImage(options.backgroundUrl);
      ctx.drawImage(bg, 0, 0, W, H);
      // Dark overlay so text stays readable
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, W, H);
    } catch {
      ctx.fillStyle = '#1e1f2e';
      ctx.fillRect(0, 0, W, H);
    }
  } else {
    ctx.fillStyle = '#1e1f2e';
    ctx.fillRect(0, 0, W, H);
  }

  // Top accent bar
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, W, 4);

  // === Avatar ===
  const AV_SIZE = 180;
  const AV_X = 40;
  const AV_Y = (H - AV_SIZE) / 2;
  const AV_CX = AV_X + AV_SIZE / 2;
  const AV_CY = AV_Y + AV_SIZE / 2;
  const AV_R = AV_SIZE / 2;

  // Avatar border ring
  ctx.beginPath();
  ctx.arc(AV_CX, AV_CY, AV_R + 5, 0, Math.PI * 2);
  ctx.fillStyle = accent;
  ctx.fill();

  // Clip and draw avatar
  ctx.save();
  ctx.beginPath();
  ctx.arc(AV_CX, AV_CY, AV_R, 0, Math.PI * 2);
  ctx.clip();
  try {
    const avatar = await loadImage(options.avatarUrl + '?size=256');
    ctx.drawImage(avatar, AV_X, AV_Y, AV_SIZE, AV_SIZE);
  } catch {
    ctx.fillStyle = accent;
    ctx.fillRect(AV_X, AV_Y, AV_SIZE, AV_SIZE);
  }
  ctx.restore();

  // === Content area ===
  const CX = AV_X + AV_SIZE + 45;
  const CW = W - CX - 30;

  // --- Rank (top right) ---
  ctx.fillStyle = '#72767d';
  ctx.font = '13px sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('RANK', W - 30, 38);

  ctx.fillStyle = accent;
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText(`#${options.rank}`, W - 30, 62);

  // --- Username ---
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 34px sans-serif';
  ctx.textAlign = 'left';
  let name = options.username;
  while (ctx.measureText(name).width > CW - 150 && name.length > 1) {
    name = name.slice(0, -1);
  }
  if (name !== options.username) name += '…';
  ctx.fillText(name, CX, 90);

  // --- Level (right-aligned) ---
  ctx.fillStyle = accent;
  ctx.font = 'bold 26px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(`LEVEL ${options.level}`, W - 30, 90);

  // --- XP Progress Bar ---
  const BAR_X = CX;
  const BAR_Y = 115;
  const BAR_W = CW;
  const BAR_H = 26;
  const BAR_R = 13;
  const progress = options.xpNeeded > 0 ? Math.min(options.xpInLevel / options.xpNeeded, 1) : 0;

  // Bar track
  ctx.fillStyle = 'rgba(44,47,63,0.8)';
  drawRoundRect(ctx, BAR_X, BAR_Y, BAR_W, BAR_H, BAR_R);
  ctx.fill();

  // Bar fill
  if (progress > 0.01) {
    const fillW = Math.max(BAR_W * progress, BAR_R * 2);
    ctx.fillStyle = accent;
    drawRoundRect(ctx, BAR_X, BAR_Y, fillW, BAR_H, BAR_R);
    ctx.fill();
  }

  // --- XP labels ---
  ctx.fillStyle = '#8e9297';
  ctx.font = '15px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(
    `${options.xpInLevel.toLocaleString()} / ${options.xpNeeded.toLocaleString()} XP`,
    BAR_X,
    BAR_Y + BAR_H + 22,
  );

  ctx.textAlign = 'right';
  ctx.fillText(
    `${options.totalXp.toLocaleString()} total · ${options.totalMessages.toLocaleString()} messages`,
    W - 30,
    BAR_Y + BAR_H + 22,
  );

  return canvas.toBuffer('image/png');
}
