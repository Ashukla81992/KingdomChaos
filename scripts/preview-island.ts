/**
 * Render the playable graph over both paintings for a visual alignment check.
 *
 *   npx tsx scripts/preview-island.ts   →  /tmp/island-preview.png, /tmp/dungeon-preview.png
 */
import sharp from 'sharp';
import { resolve } from 'node:path';
import { CROWN_QUEST } from '../src/engine/board';

const root = resolve(import.meta.dirname, '..');
const colors: Record<string, string> = { circuit: '#ffffff', final: '#ffd166', side: '#7cf', home: '#f0f', temple: '#ff0', dungeon: '#fff' };
const house = ['#e5484d', '#3e7bfa', '#9b59d0', '#30a46c'];

for (const map of ['island', 'dungeon'] as const) {
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024">`;
  for (const e of CROWN_QUEST.edges) {
    const a = CROWN_QUEST.nodes.find((n) => n.id === e.a)!;
    if (a.map !== map) continue;
    const stroke = e.kind === 'buildable' ? '#f80' : e.kind === 'blockable' ? '#f44' : colors[e.lane] ?? '#fff';
    svg += `<polyline points="${e.route.map((p) => p.join(',')).join(' ')}" fill="none" stroke="${stroke}" stroke-width="3" stroke-opacity="0.8"/>`;
  }
  for (const n of CROWN_QUEST.nodes) {
    if (n.map !== map) continue;
    const fill = n.house !== undefined ? house[n.house] : n.station ? '#0f0' : n.teleport ? (n.teleport.type === 'trap' ? '#f00' : '#0ff') : n.safe ? '#ff0' : '#222';
    svg += `<circle cx="${n.xy[0]}" cy="${n.xy[1]}" r="9" fill="${fill}" stroke="#fff" stroke-width="2"/>`;
    const label = n.circuit !== undefined ? String(n.circuit) : n.id.replace(/^(ring|tunnel|ruins|f-\w+|d)-/, '');
    svg += `<text x="${n.xy[0] + 10}" y="${n.xy[1] - 8}" font-size="12" font-weight="bold" fill="#fff" stroke="#000" stroke-width="0.6">${label}</text>`;
  }
  svg += '</svg>';
  await sharp(resolve(root, `public/board/${map}.jpg`))
    .composite([{ input: Buffer.from(svg) }])
    .png()
    .toFile(`/tmp/${map}-preview.png`);
}
console.log('Wrote /tmp/island-preview.png and /tmp/dungeon-preview.png');
