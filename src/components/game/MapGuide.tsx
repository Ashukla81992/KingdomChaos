'use client';

import { CROWN_QUEST, FEATURE_INFO, LOCATION_INFO } from '@/engine';
import { SEATS } from '@/lib/seats';
import { EmblemShape } from '../art/art';
import { PieceToken } from '../art/token';
import { Modal } from '../ui/Modal';

function Svg({ children, vb = '-14 -14 28 28' }: { children: React.ReactNode; vb?: string }) {
  return (
    <svg width={30} height={30} viewBox={vb} aria-hidden="true">
      {children}
    </svg>
  );
}

// eslint-disable-next-line @next/next/no-img-element
const Art = ({ src }: { src: string }) => <img src={src} alt="" width={30} height={30} className="h-[30px] w-[30px] object-contain" />;

function Row({ icon, name, children }: { icon: React.ReactNode; name: string; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 py-1.5">
      <span className="mt-0.5 flex w-8 shrink-0 justify-center">{icon}</span>
      <span className="text-sm leading-snug">
        <b>{name}.</b> {children}
      </span>
    </li>
  );
}

/** The legend: every marker drawn on the island and dungeon. */
export function MapGuide({ open, onClose, showPaths, onShowPaths }: { open: boolean; onClose: () => void; showPaths: boolean; onShowPaths: (on: boolean) => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Legend" wide>
      <label className="mb-3 flex items-start gap-2 rounded-2xl bg-[#fff8e8] p-3 text-sm">
        <input type="checkbox" className="mt-1" checked={showPaths} onChange={(e) => onShowPaths(e.target.checked)} data-show-royal-paths />
        <span>
          <b>Show Royal Paths</b>
          <span className="block text-[#4a5374]">Inspection only. The lines follow each house’s road to the temple. A locked path is not a move.</span>
        </span>
      </label>
      <ul className="divide-y divide-[#efe5cf]" data-map-guide>
        <Row
          icon={
            <Svg vb="-22 -58 44 66">
              <PieceToken kind="king" theme={SEATS[0]} />
            </Svg>
          }
          name="Pieces"
        >
          The King, Queen, Witch and Knight in that house’s colours. A small gem badge means it carries a gem; S or I means Shield or Immunity. The painted seal under a piece stays visible.
        </Row>
        <Row
          icon={
            <Svg>
              <circle r={8} fill="#efe0bd" stroke="#6b5232" strokeWidth={1.2} />
            </Svg>
          }
          name="Road space"
        >
          {LOCATION_INFO.circuit.rule}
        </Row>
        <Row
          icon={
            <Svg>
              <circle r={8} fill="#efe0bd" stroke="#c58b00" strokeWidth={2.4} />
              <path d="M0 -4.5 L1.3 -1.4 L4.6 -1.4 L1.9 0.6 L2.9 3.9 L0 2 L-2.9 3.9 L-1.9 0.6 L-4.6 -1.4 L-1.3 -1.4 Z" fill="#c58b00" />
            </Svg>
          }
          name="Safe space"
        >
          {FEATURE_INFO.safe}
        </Row>
        <Row
          icon={
            <Svg>
              <circle r={11} fill={SEATS[1].color} stroke="#fff" strokeWidth={2} />
              <EmblemShape emblem={SEATS[1].emblem} size={12} />
            </Svg>
          }
          name="House gate and plate"
        >
          {FEATURE_INFO.entry} A green tick on a plate means the selected piece has already touched it.
        </Row>
        <Row
          icon={
            <Svg>
              <path d="M-12 6 Q0 -10 12 6" stroke="#f6e7c1" strokeWidth={5} fill="none" strokeLinecap="round" />
            </Svg>
          }
          name="Routes"
        >
          <span className="block">{LOCATION_INFO.side.rule}</span>
          {CROWN_QUEST.trails.map((t) => (
            <span key={t.id} className="mt-1 block" data-trail={t.id}>
              <b>{t.name}</b> ({t.kind}): {t.perk} <i>Risk:</i> {t.risk}
            </span>
          ))}
        </Row>
        <Row
          icon={
            <Svg>
              <circle r={8} fill="#efe0bd" stroke="#6b5232" strokeWidth={1.2} />
              <circle r={11} fill="none" stroke={SEATS[2].color} strokeWidth={3} />
            </Svg>
          }
          name="Fork"
        >
          {FEATURE_INFO.fork}
        </Row>
        <Row
          icon={
            <Svg>
              <path d="M-12 8 L12 -8" stroke="#fff" strokeWidth={9} strokeLinecap="round" />
              <path d="M-12 8 L12 -8" stroke={SEATS[3].color} strokeWidth={5} strokeLinecap="round" />
            </Svg>
          }
          name="Royal Path"
        >
          {LOCATION_INFO.final.rule}
        </Row>
        <Row icon={<Art src="/art/gem-ruby.png" />} name="Gem stations">
          Ruby Mine, Sapphire Falls, Diamond Hill and Emerald Grove. {FEATURE_INFO.station}
        </Row>
        <Row
          icon={
            <Svg>
              <circle r={9} fill="#d64532" stroke="#fff" strokeWidth={1.8} />
              <path d="M-3.5 -3.5 L3.5 3.5 M3.5 -1 L3.5 3.5 L-1 3.5" stroke="#fff" strokeWidth={1.8} fill="none" />
            </Svg>
          }
          name="Trap"
        >
          Ending a move on the Landslide sweeps the piece to Willow Valley. The Hidden Pit drops it under Dragon Mountain. The River Current carries it to the west beach. Gems and plates are kept; plates on the way do not count.
        </Row>
        <Row
          icon={
            <Svg>
              <path d="M0 -9 L9 7 L-9 7 Z" fill="#f2a11a" stroke="#6b3b00" strokeWidth={1.4} strokeLinejoin="round" />
              <path d="M0 -4 L0 1.5 M0 4 L0 4.2" stroke="#3b2100" strokeWidth={1.8} strokeLinecap="round" />
            </Svg>
          }
          name="Trap risk"
        >
          Trap risk on the Bramble Snare, the Spray Snare and the Crag Snare. A piece that stops there may spring a snare. Passing through is safe.
        </Row>
        <Row
          icon={
            <Svg>
              <circle r={9} fill="#18a38a" stroke="#fff" strokeWidth={1.8} />
              <path d="M-3.5 3.5 L3.5 -3.5 M-1 -3.5 L3.5 -3.5 L3.5 1" stroke="#fff" strokeWidth={1.8} fill="none" />
            </Svg>
          }
          name="Shortcut"
        >
          Ending a move on the Magic Lift carries the piece down the east coast. The Secret Passage leads north along the west coast. Plates on the skipped spaces do not count.
        </Row>
        <Row icon={<Art src="/art/icon-dig.png" />} name="Dig site">
          {FEATURE_INFO.dig} Lakeside Dig, Old Camp Dig, Glade Dig, Ruins Dig and Bone Dig.
        </Row>
        <Row icon={<Art src="/art/icon-trapdoor.png" />} name="Dragon Gate">
          {FEATURE_INFO.dungeonGate} Pieces underground are shown in a small badge beside it.
        </Row>
        <Row icon={<Art src="/art/icon-boat.png" />} name="Boat">
          {FEATURE_INFO.dock}
        </Row>
        <Row icon={<Art src="/art/icon-plane.png" />} name="Plane">
          {FEATURE_INFO.airfield}
        </Row>
        <Row
          icon={
            <Svg>
              <circle r={10} fill="none" stroke="#9b6cf0" strokeWidth={2.5} strokeDasharray="3 3" />
            </Svg>
          }
          name="Moonstone Arch"
        >
          {FEATURE_INFO.portal}
        </Row>
        <Row icon={<Art src="/art/icon-bridge.png" />} name="Bridge">
          The Stone Bridge starts open and crosses the gorge. Collapse Bridge can close it if nobody would be stranded.
        </Row>
        <Row icon={<Art src="/art/icon-broken-bridge.png" />} name="Broken bridge">
          The Rope Bridge starts broken. Build Bridge or Repair opens it — for every house.
        </Row>
        <Row icon={<Art src="/art/icon-tunnel.png" />} name="Tunnel">
          The Dragon Mountain Tunnel is one step of the main road, between the north road and the Crystal Mine. Cards cannot close it. The Crystal Mine Tunnel starts sealed; Dig Tunnel or a dig opens it.
        </Row>
        <Row icon={<Art src="/art/icon-dig.png" />} name="Road plot">
          The Camp Road and the Ruins Road start unbuilt. Build Road or a dig paves one.
        </Row>
        <Row icon={<Art src="/art/icon-mountain.png" />} name="Rocks / mountain">
          A Landslide card blocks Temple Pass, Vale Pass or Crag Pass. Raise Mountain closes a terrain site. Repair clears either.
        </Row>
        <Row icon={<Art src="/art/icon-river.png" />} name="River">
          Create River floods a terrain site and closes its paths. Repair clears it.
        </Row>
        <Row icon={<Art src="/art/dragon.png" />} name="Dragon">
          {LOCATION_INFO.dragonChamber.rule} Nobody walks past a wild or guarding dragon.
        </Row>
        <Row icon={<Art src="/art/icon-chest.png" />} name="Dungeon">
          {LOCATION_INFO.monster.rule} {LOCATION_INFO.gemChamber.rule} {LOCATION_INFO.trap.rule}
        </Row>
      </ul>
    </Modal>
  );
}
