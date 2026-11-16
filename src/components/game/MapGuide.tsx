'use client';

import { CROWN_QUEST, FEATURE_INFO, LOCATION_INFO, MAP_MARKER_INFO } from '@/engine';
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

function Swatch({ color }: { color: string }) {
  return (
    <Svg>
      <circle r={9} fill={color} stroke="#fff" strokeWidth={1.8} />
    </Svg>
  );
}

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
          The King, Queen, Witch and Knight in that house’s colours. A small gem badge means it carries a gem; S, I or G means Shield, Immunity or Royal Guard. The painted seal under a piece stays visible.
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
          name="House gate and checkpoint"
        >
          {FEATURE_INFO.entry} A green tick on a gate means the selected piece has already touched that checkpoint.
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

        <Row icon={<Swatch color={MAP_MARKER_INFO.landslide.color} />} name={MAP_MARKER_INFO.landslide.name}>
          {MAP_MARKER_INFO.landslide.rule}
        </Row>
        <Row icon={<Swatch color={MAP_MARKER_INFO.portal.color} />} name={MAP_MARKER_INFO.portal.name}>
          {MAP_MARKER_INFO.portal.rule}
        </Row>
        <Row icon={<Swatch color={MAP_MARKER_INFO.teleport.color} />} name={MAP_MARKER_INFO.teleport.name}>
          {MAP_MARKER_INFO.teleport.rule}
        </Row>
        <Row icon={<Swatch color={MAP_MARKER_INFO.crossingOpen.color} />} name={MAP_MARKER_INFO.crossingOpen.name}>
          {MAP_MARKER_INFO.crossingOpen.rule}
        </Row>
        <Row icon={<Swatch color={MAP_MARKER_INFO.crossingClosed.color} />} name={MAP_MARKER_INFO.crossingClosed.name}>
          {MAP_MARKER_INFO.crossingClosed.rule}
        </Row>
        <Row icon={<Swatch color={MAP_MARKER_INFO.trap.color} />} name={MAP_MARKER_INFO.trap.name}>
          {MAP_MARKER_INFO.trap.rule} Landslide sweeps to Willow Valley; Hidden Pit drops under Dragon Mountain; River Current carries to the west beach.
        </Row>
        <Row icon={<Swatch color={MAP_MARKER_INFO.shortcut.color} />} name={MAP_MARKER_INFO.shortcut.name}>
          {MAP_MARKER_INFO.shortcut.rule} Magic Lift and Secret Passage are the painted shortcuts.
        </Row>
        <Row icon={<Swatch color={MAP_MARKER_INFO.hazard.color} />} name={MAP_MARKER_INFO.hazard.name}>
          {MAP_MARKER_INFO.hazard.rule}
        </Row>
        <Row icon={<Swatch color={MAP_MARKER_INFO.encounter.color} />} name={MAP_MARKER_INFO.encounter.name}>
          {MAP_MARKER_INFO.encounter.rule}
        </Row>
        <Row icon={<Swatch color={MAP_MARKER_INFO.safeRoom.color} />} name={MAP_MARKER_INFO.safeRoom.name}>
          {MAP_MARKER_INFO.safeRoom.rule}
        </Row>
        <Row icon={<Swatch color={MAP_MARKER_INFO.wildDragon.color} />} name={MAP_MARKER_INFO.wildDragon.name}>
          {MAP_MARKER_INFO.wildDragon.rule}
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
        <Row icon={<Art src="/art/icon-bridge.png" />} name="Bridge">
          The Stone Bridge starts open and crosses the gorge. Collapse Bridge can close it when every house stays connected.
        </Row>
        <Row icon={<Art src="/art/icon-broken-bridge.png" />} name="Broken bridge">
          The Rope Bridge starts broken. Build Bridge or Repair opens it — for every house.
        </Row>
        <Row icon={<Art src="/art/icon-tunnel.png" />} name="Tunnel">
          The Dragon Mountain Tunnel is one step of the main road. Cards leave it open. The Crystal Mine Tunnel starts sealed; Dig Tunnel or a dig opens it.
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
          {LOCATION_INFO.dragonChamber.rule} A wild or guarding dragon blocks most pieces; the Witch may pass a wild one.
        </Row>
        <Row icon={<Art src="/art/icon-chest.png" />} name="Dungeon">
          {LOCATION_INFO.monster.rule} {LOCATION_INFO.gemChamber.rule} {LOCATION_INFO.trap.rule}
        </Row>
      </ul>
    </Modal>
  );
}
