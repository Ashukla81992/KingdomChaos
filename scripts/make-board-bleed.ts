/**
 * Build the "bleed" behind each board painting: a 3 × 3 area whose middle is the painting. Next to the
 * painting its coast is mirrored (so every edge continues seamlessly); further out the edge colours are
 * stretched, blurred and dimmed into open sea.
 * The board fills any screen shape with it instead of empty margins.
 *
 *   npx tsx scripts/make-board-bleed.ts
 *
 * Writes public/board/<name>-bleed.jpg (half resolution, three times the painting's width and height).
 */
import sharp from 'sharp';
import { resolve } from 'node:path';

const dir = resolve(import.meta.dirname, '../public/board');
const SCALE = 0.5;
/** Board pixels over which the mirror fades from sharp to blurred. */
const FEATHER = 70;

async function bleed(name: string) {
  const src = resolve(dir, `${name}.jpg`);
  const meta = await sharp(src).metadata();
  const w = Math.round(meta.width! * SCALE);
  const h = Math.round(meta.height! * SCALE);
  const pad = { top: h, bottom: h, left: w, right: w };
  const small = await sharp(src).resize(w, h).toBuffer();
  // Right at the edge: the painting's own coast, mirrored. Further out: its edge colours stretched and
  // blurred into open sea, so no copies of the island appear.
  const sharpRaw = await sharp(small).extend({ ...pad, extendWith: 'mirror' }).removeAlpha().raw().toBuffer();
  const stretched = await sharp(small).extend({ ...pad, extendWith: 'copy' }).png().toBuffer();
  const blurRaw = await sharp(stretched).blur(36).modulate({ saturation: 0.9 }).removeAlpha().raw().toBuffer();
  const out = Buffer.alloc(sharpRaw.length);
  const feather = FEATHER * SCALE;
  for (let y = 0; y < 3 * h; y++) {
    for (let x = 0; x < 3 * w; x++) {
      // Distance outside the central painting, in output pixels.
      const dx = Math.max(w - x, x - 2 * w + 1, 0);
      const dy = Math.max(h - y, y - 2 * h + 1, 0);
      const d = Math.hypot(dx, dy);
      const t = Math.min(1, d / feather);
      // Dim gently toward the far edges so the eye stays on the island.
      const dim = 1 - 0.28 * Math.min(1, d / w);
      const i = (y * 3 * w + x) * 3;
      for (let k = 0; k < 3; k++) out[i + k] = Math.round((sharpRaw[i + k] * (1 - t) + blurRaw[i + k] * t) * dim);
    }
  }
  await sharp(out, { raw: { width: 3 * w, height: 3 * h, channels: 3 } })
    .jpeg({ quality: 72, mozjpeg: true })
    .toFile(resolve(dir, `${name}-bleed.jpg`));
  console.log(`${name}-bleed.jpg ${3 * w}×${3 * h}`);
}

for (const name of ['island', 'dungeon']) await bleed(name);
