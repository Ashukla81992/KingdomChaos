/**
 * Cut the supplied card sheets and the dragon miniature into public/art.
 *
 *   npx tsx scripts/crop-cards.ts <12-card-sheet.png> <8-card-sheet.png> <dragon.png>
 *
 * Sheet A is 4 columns × 3 rows. Sheet B is 4 × 2. Black gutters and the
 * rounded-corner padding become transparent. Two paintings on sheet B are not
 * cards in the deck (a portal pair and a spike chest); they are not written.
 */
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const [sheetA, sheetB, dragon] = process.argv.slice(2);
if (!sheetA || !sheetB || !dragon) {
  console.error('Usage: npx tsx scripts/crop-cards.ts <12-card-sheet> <8-card-sheet> <dragon>');
  process.exit(1);
}

const out = resolve(import.meta.dirname, '../public/art');
mkdirSync(resolve(out, 'cards'), { recursive: true });

/** Content boxes measured from the supplied sheets (left, top, right, bottom). */
const A_COLS: [number, number][] = [
  [38, 166],
  [188, 318],
  [334, 465],
  [486, 617],
];
const A_ROWS: [number, number][] = [
  [2, 161],
  [166, 320],
  [329, 488],
];
const B_COLS: [number, number][] = [
  [10, 167],
  [169, 326],
  [331, 487],
  [489, 646],
];
const B_ROWS: [number, number][] = [
  [2, 219],
  [226, 470],
];

/** Row-major card ids. `null` is a painting that is not a deck card. */
const SHEET_A = [
  ['build_bridge', 'dig_tunnel', 'landslide', 'raise_mountain'],
  ['shield', 'magic_boots', 'dragon_slayer', 'dragon_feast'],
  ['swap', 'slow_down', 'dragon_roar', 'reveal_discovery'],
];
const SHEET_B = [
  ['collapse_bridge', 'build_road', 'create_river', 'repair'],
  ['immunity', 'rescue', null, null],
];

function knockOutBlack(data: Buffer, width: number, height: number) {
  const bg = (i: number) => data[i] < 28 && data[i + 1] < 28 && data[i + 2] < 28;
  const seen = new Uint8Array(width * height);
  const stack: number[] = [];
  const seed = (x: number, y: number) => {
    const p = y * width + x;
    if (!seen[p] && bg(p * 4)) {
      seen[p] = 1;
      stack.push(p);
    }
  };
  for (let x = 0; x < width; x++) {
    seed(x, 0);
    seed(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    seed(0, y);
    seed(width - 1, y);
  }
  while (stack.length) {
    const p = stack.pop()!;
    data[p * 4 + 3] = 0;
    const x = p % width;
    const y = (p / width) | 0;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const q = ny * width + nx;
      if (seen[q] || !bg(q * 4)) continue;
      seen[q] = 1;
      stack.push(q);
    }
  }
}

async function cutCard(src: string, box: [number, number, number, number], file: string) {
  const [x0, y0, x1, y1] = box;
  const { data, info } = await sharp(src)
    .extract({ left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  knockOutBlack(data, info.width, info.height);
  await sharp(data, { raw: info }).png().toFile(resolve(out, 'cards', file));
}

for (let r = 0; r < SHEET_A.length; r++) {
  for (let c = 0; c < SHEET_A[r].length; c++) {
    const id = SHEET_A[r][c];
    if (!id) continue;
    const [x0, x1] = A_COLS[c];
    const [y0, y1] = A_ROWS[r];
    await cutCard(sheetA, [x0, y0, x1, y1], `${id}.png`);
  }
}
for (let r = 0; r < SHEET_B.length; r++) {
  for (let c = 0; c < SHEET_B[r].length; c++) {
    const id = SHEET_B[r][c];
    if (!id) continue;
    const [x0, x1] = B_COLS[c];
    const [y0, y1] = B_ROWS[r];
    await cutCard(sheetB, [x0, y0, x1, y1], `${id}.png`);
  }
}

const dragonRaw = await sharp(dragon).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
knockOutBlack(dragonRaw.data, dragonRaw.info.width, dragonRaw.info.height);
await sharp(dragonRaw.data, { raw: dragonRaw.info }).trim().resize({ width: 512, height: 512, fit: 'inside' }).png().toFile(resolve(out, 'dragon.png'));
console.log('Wrote card faces to public/art/cards and public/art/dragon.png');
