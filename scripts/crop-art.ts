/**
 * Cut the supplied sprite sheets into individual images in public/art.
 *
 *   npx tsx scripts/crop-art.ts <gems-sheet.png> <chars-sheet.png> <icons-sheet.png>
 *
 * Near-white backgrounds become transparent and each sprite is trimmed.
 */
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const [gemsSheet, charsSheet, iconsSheet] = process.argv.slice(2);
const out = resolve(import.meta.dirname, '../public/art');
mkdirSync(out, { recursive: true });

async function cell(src: string, cols: number, rows: number, c: number, r: number, file: string, size: number) {
  const meta = await sharp(src).metadata();
  const w = Math.floor(meta.width! / cols);
  const h = Math.floor(meta.height! / rows);
  const { data, info } = await sharp(src)
    .extract({ left: c * w + 8, top: r * h + 2, width: w - 16, height: h - 4 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    const [R, G, B] = [data[i], data[i + 1], data[i + 2]];
    const min = Math.min(R, G, B);
    if (min > 238) data[i + 3] = 0;
    else if (min > 225) data[i + 3] = Math.min(data[i + 3], Math.round(((238 - min) / 13) * 255));
  }
  await sharp(data, { raw: info })
    .trim({ threshold: 1 })
    .resize({ width: size, height: size, fit: 'inside' })
    .png()
    .toFile(resolve(out, file));
}

const gems = ['ruby', 'sapphire', 'emerald', 'diamond'];
for (let i = 0; i < 4; i++) {
  await cell(gemsSheet, 4, 2, i, 0, `gem-${gems[i]}.png`, 160);
  await cell(gemsSheet, 4, 2, i, 1, `gem-${gems[i]}-empty.png`, 160);
}
const houses = ['red', 'blue', 'green', 'purple'];
const kinds = ['king', 'queen', 'witch', 'knight'];
for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) await cell(charsSheet, 4, 4, c, r, `${houses[r]}-${kinds[c]}.png`, 256);
const icons = [
  ['bridge', 'broken-bridge', 'tunnel', 'river', 'mountain'],
  ['boat', 'plane', 'chest', 'dig', 'trapdoor'],
];
for (let r = 0; r < 2; r++) for (let c = 0; c < 5; c++) await cell(iconsSheet, 5, 2, c, r, `icon-${icons[r][c]}.png`, 160);
console.log('Wrote sprites to', out);
