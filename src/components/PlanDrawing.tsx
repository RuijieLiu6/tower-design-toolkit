// Present: a floor plan drawn at a standard scale on the A2 board (594 x 420 mm, units = sheet millimetres).
// Plate, indicative grid, core with lift shafts (doors where cars stop, crossed where they pass), exit stairs with
// treads, dimensions, north arrow, scale bar, level key, legend and a title block. No names or logos (brief p.27).
import { useMemo } from 'react'
import { VTC_NORTH_DEG } from '../context'
import { stairEnclosure, stairSpots, storeyLoads, PLACEMENT_LABEL } from '../engine/egress'
import { liftCheck } from '../engine/lifts'
import { blockSpans, spanAt, towerFloors } from '../engine/massing'
import { UNIT_SHORT, bands, floorLayout } from '../engine/interior'
import { coreLayout, fitScale, typicalFloor } from '../engine/plan'
import { USES } from '../engine/types'
import { DaylightPlanOverlay } from './DaylightBands'
import { useUnits } from '../lib/units'
import { U } from './Units'
import { useStore, useTowers } from '../store'

const SHEET = { w: 594, h: 420 }
const AREA = { x: 16, y: 16, w: 408, h: 362 }
const COL = { x: 436, w: 142 }
const FONT = 'Inter, "Segoe UI", Arial, sans-serif'
const INK = '#1f2328'
const GROUP_COLOR: Record<string, string> = { office: '#3f6690', hotel: '#b98a1e', residential: '#5f8f4a', public: '#8e5ba8', shuttle: '#2a8f86', service: '#8a9096' }
const fmt = (v: number) => Math.round(v).toLocaleString()

/** `level` overrides the board's level picker; `standalone` draws it for the Drawings viewer (not over the 3D view). */
export default function PlanDrawing({ level, standalone = false }: { level?: number | null; standalone?: boolean } = {}) {
  const towers = useTowers()
  const { selectedTower, planLevel: boardLevel, planGrid, liftPresets, egressPresets, project } = useStore()
  const planLevel = level !== undefined ? level : boardLevel
  const unit = useUnits((st) => st.unit)
  const t = towers.find((x) => x.id === selectedTower) ?? towers[0]

  const d = useMemo(() => {
    if (!t) return null
    const floors = towerFloors(t)
    const f = (planLevel !== null ? floors.find((x) => x.level === planLevel) : null) ?? typicalFloor(t)
    if (!f) return null
    const lift = liftCheck(t, liftPresets, egressPresets)
    const layout = coreLayout(t, lift, liftPresets, egressPresets)
    const storey = storeyLoads(t, egressPresets, liftPresets).find((s) => s.level === f.level)!
    const enc = stairEnclosure(storey.stairMm, storey.f2f, egressPresets)
    const stairs = stairSpots(t, Math.max(2, Math.round(egressPresets.stairs)), enc.a, enc.b)
    // The plate of the stacked block at this level (an old two-field tower: podium or tower).
    const blk = t.blocks?.length && !t.imported ? spanAt(blockSpans(t), (f.z0 + f.z1) / 2)?.block ?? null : null
    const W = blk ? blk.width : f.podium ? t.podiumWidth : t.width, D = blk ? blk.depth : f.podium ? t.podiumDepth : t.depth
    const scale = fitScale(W + 20, D + 20, AREA.w, AREA.h)
    return { floors, f, lift, layout, storey, enc, stairs, W, D, scale, typical: planLevel === null, blk }
  }, [t, planLevel, liftPresets, egressPresets])

  if (!t || !d) return <div className="flex h-full items-center justify-center text-xs text-muted">No floor to draw.</div>
  const { floors, f, layout, storey, enc, stairs, W, D, scale, blk } = d
  const moved = !!blk && (Math.abs(blk.dx) > 0.05 || Math.abs(blk.dy) > 0.05 || Math.abs(blk.rotation) > 0.05)
  const mm = (m: number) => (m * 1000) / scale
  const cx = AREA.x + AREA.w / 2, cy = AREA.y + AREA.h / 2
  const X = (x: number) => cx + mm(x), Y = (y: number) => cy - mm(y)
  const c = layout.core
  const coreArea = t.coreShare * t.width * t.depth
  const edgeStairArea = stairs.filter((s) => !s.inCore).length * enc.area
  const net = Math.max(0, f.area - coreArea - edgeStairArea)
  const room = f.skyLobby && t.skyRoom?.level === f.level ? t.skyRoom : null
  const north = (project === 'vtc' ? VTC_NORTH_DEG : 0) - t.rotation
  const label = room ? 'Public sky room' : f.skyLobby ? 'Sky lobby' : USES[f.use].label
  const lay = floorLayout(t, f)
  const bandInner = t.interior ? bands(t, t.interior.corridor).inner : 0

  // Indicative grid at about 9 m bays.
  const nx = Math.max(1, Math.round(W / 9)), ny = Math.max(1, Math.round(D / 9))
  const gx = Array.from({ length: nx + 1 }, (_, k) => -W / 2 + (k * W) / nx)
  const gy = Array.from({ length: ny + 1 }, (_, k) => -D / 2 + (k * D) / ny)

  const here = layout.shafts.filter((s) => f.z0 >= s.z0 - 0.01 && f.z0 <= s.z1 + 0.01)
  const groups = new Map<string, typeof here>()
  for (const s of here) groups.set(s.group, [...(groups.get(s.group) ?? []), s])
  const colorOf = (s: (typeof here)[number]) => (s.cls === 'service' ? GROUP_COLOR.service : s.cls === 'public' ? GROUP_COLOR.public : s.kind === 'shuttle' ? GROUP_COLOR.shuttle : GROUP_COLOR[s.cls])
  const side = layout.side
  const w = storey.stairMm / 1000

  const tower = floors.filter((x) => x.z0 >= 0)
  const keyH = 150, keyY = 78
  const kh = keyH / Math.max(1, tower.length)
  // Scale bar: metres, or round foot steps when the viewer shows feet (lib/units.ts).
  const ftBar = unit === 'ft'
  const bar = (ftBar ? [0, 10, 20, 50] : [0, 5, 10, 20]).filter((v) => mm(ftBar ? v * 0.3048 : v) <= 120)
  const barMm = (v: number) => mm(ftBar ? v * 0.3048 : v)
  const today = new Date().toISOString().slice(0, 10)

  return (
    <svg {...(standalone ? { 'data-plan-viewer': '' } : { 'data-plan-drawing': '' })} viewBox={`0 0 ${SHEET.w} ${SHEET.h}`} className={standalone ? 'h-full w-full bg-white' : 'absolute inset-0 h-full w-full bg-white'} role="img"
      aria-label={`Floor plan, level ${f.level}, ${label}, scale 1:${scale}`} fontFamily={FONT} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <marker id="dimTick" viewBox="-2 -2 4 4" markerWidth="3" markerHeight="3" orient="auto"><path d="M-1.5 1.5 L1.5 -1.5" stroke={INK} strokeWidth="0.6" /></marker>
        <pattern id="plantHatch" width="2" height="2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="2" stroke="#8a9099" strokeWidth="0.3" /></pattern>
      </defs>
      <rect x="0" y="0" width={SHEET.w} height={SHEET.h} fill="#ffffff" />
      <rect x="8" y="8" width={SHEET.w - 16} height={SHEET.h - 16} fill="none" stroke={INK} strokeWidth="0.5" />

      {/* Grid */}
      {planGrid && (
        <g stroke="#8a9099" strokeWidth="0.18" strokeDasharray="6 1.5 1 1.5" fill="none">
          {gx.map((x, i) => <line key={`gx${i}`} x1={X(x)} y1={Y(D / 2 + 5.5)} x2={X(x)} y2={Y(-D / 2 - 2)} />)}
          {gy.map((y, i) => <line key={`gy${i}`} x1={X(-W / 2 - 5.5)} y1={Y(y)} x2={X(W / 2 + 2)} y2={Y(y)} />)}
        </g>
      )}
      {planGrid && gx.map((x, i) => (
        <g key={`bx${i}`}><circle cx={X(x)} cy={Y(D / 2 + 5.5) - 3.2} r="3.2" fill="#fff" stroke="#8a9099" strokeWidth="0.25" />
          <text x={X(x)} y={Y(D / 2 + 5.5) - 2.1} fontSize="3" textAnchor="middle" fill={INK}>{String.fromCharCode(65 + i)}</text></g>
      ))}
      {planGrid && gy.map((y, i) => (
        <g key={`by${i}`}><circle cx={X(-W / 2 - 5.5) - 3.2} cy={Y(y)} r="3.2" fill="#fff" stroke="#8a9099" strokeWidth="0.25" />
          <text x={X(-W / 2 - 5.5) - 3.2} y={Y(y) + 1.1} fontSize="3" textAnchor="middle" fill={INK}>{i + 1}</text></g>
      ))}

      {/* Plate: tint by use, facade as a double line */}
      <rect x={X(-W / 2)} y={Y(D / 2)} width={mm(W)} height={mm(D)} fill={f.use === 'mechanical' ? 'url(#plantHatch)' : room ? '#8e5ba8' : USES[f.use].color} fillOpacity={f.use === 'mechanical' ? 1 : room ? 0.16 : 0.12} />
      {/* Interior layout (engine/interior.ts): units or keys between corridor and facade, office lease depth, activities. */}
      {lay && (lay.kind === 'homes' || lay.kind === 'hotel') && (
        <g data-interior={lay.kind}>
          {lay.rooms.map((r, i) => (
            <g key={`rm${i}`}>
              <rect x={X(r.rect.x0)} y={Y(r.rect.y1)} width={mm(r.rect.x1 - r.rect.x0)} height={mm(r.rect.y1 - r.rect.y0)} fill={r.kind === 'leftover' ? 'url(#plantHatch)' : '#ffffff'} fillOpacity={r.kind === 'leftover' ? 0.5 : 0.55} stroke={INK} strokeWidth="0.22" />
              {r.kind !== 'leftover' && r.kind !== 'key' && <text x={X((r.rect.x0 + r.rect.x1) / 2)} y={Y((r.rect.y0 + r.rect.y1) / 2) + 0.8} fontSize="2.1" textAnchor="middle" fill={INK}>{r.label} {Math.round(r.area)}</text>}
            </g>
          ))}
          <rect x={X(-bandInner / 2)} y={Y(bandInner / 2)} width={mm(bandInner)} height={mm(bandInner)} fill="none" stroke={INK} strokeWidth="0.25" strokeDasharray="1.5 1" />
          {lay.kind === 'hotel' && <text x={X(0)} y={Y(D / 2) + mm((D - bandInner) / 4) + 1} fontSize="2.4" textAnchor="middle" fill={INK} stroke="#fff" strokeWidth="0.6" paintOrder="stroke">{lay.keys} keys on this floor</text>}
        </g>
      )}
      {lay && lay.kind === 'office' && (
        <g data-interior="office" fontSize="2.3" fill={INK}>
          <rect x={X(-W / 2 + 6)} y={Y(D / 2 - 6)} width={mm(W - 12)} height={mm(D - 12)} fill="none" stroke="#2a8f86" strokeWidth="0.3" strokeDasharray="2 1.2" />
          <text x={X(-W / 2 + 6) + 1} y={Y(D / 2 - 6) + 3} fill="#2a8f86">6 m from glazing · {Math.round(lay.within6 * 100)}% of the floor</text>
          <line x1={X(0)} y1={Y(-D / 2)} x2={X(0)} y2={Y(-D / 2 + lay.leaseDepth)} stroke={INK} strokeWidth="0.25" markerStart="url(#dimTick)" markerEnd="url(#dimTick)" />
          <text x={X(0) + 1.2} y={Y(-D / 2 + lay.leaseDepth / 2)}><U>{`lease depth ${lay.leaseDepth.toFixed(1)} m`}</U></text>
        </g>
      )}
      {lay && lay.kind === 'public' && (
        <g data-interior="public" fontSize="2.3" fill={INK}>
          {lay.activities.map((a, i) => <text key={a.id} x={X(-W / 2 + 1.5)} y={Y(-D / 2 + 1.5) - 2 - (lay.activities.length - 1 - i) * 3.2}><U>{`${a.name}: ${Math.round(a.area)} m², about ${Math.round(a.design)} people · ${a.hours}`}</U></text>)}
        </g>
      )}
      {/* Daylight screen bands (DaylightBands.tsx), when that node is on. */}
      <DaylightPlanOverlay t={t} f={f} X={X} Y={Y} mm={mm} />
      <rect x={X(-W / 2)} y={Y(D / 2)} width={mm(W)} height={mm(D)} fill="none" stroke={INK} strokeWidth="0.7" />
      <rect x={X(-W / 2 + 0.3)} y={Y(D / 2 - 0.3)} width={mm(W - 0.6)} height={mm(D - 0.6)} fill="none" stroke={INK} strokeWidth="0.25" />

      {/* Core: 400 mm walls */}
      <rect x={X(-c / 2)} y={Y(c / 2)} width={mm(c)} height={mm(c)} fill="#2b2f36" />
      <rect x={X(-c / 2 + 0.4)} y={Y(c / 2 - 0.4)} width={mm(Math.max(0, c - 0.8))} height={mm(Math.max(0, c - 0.8))} fill="#ffffff" />

      {/* Lift shafts: crossed; a coloured bar marks a door where the cars stop on this floor */}
      {here.map((s, i) => {
        const stop = s.stops.has(f.level)
        const doorY = s.y >= 0 ? s.y - side / 2 : s.y + side / 2
        return (
          <g key={`sh${i}`}>
            <rect x={X(s.x - side / 2)} y={Y(s.y + side / 2)} width={mm(side)} height={mm(side)} fill={colorOf(s)} fillOpacity="0.28" stroke={s.outside ? '#c0392b' : INK} strokeWidth="0.25" strokeDasharray={s.outside ? '1 0.6' : undefined} />
            <line x1={X(s.x - side / 2)} y1={Y(s.y + side / 2)} x2={X(s.x + side / 2)} y2={Y(s.y - side / 2)} stroke={INK} strokeWidth="0.12" />
            <line x1={X(s.x - side / 2)} y1={Y(s.y - side / 2)} x2={X(s.x + side / 2)} y2={Y(s.y + side / 2)} stroke={INK} strokeWidth="0.12" />
            {stop && <line x1={X(s.x - 0.55)} y1={Y(doorY)} x2={X(s.x + 0.55)} y2={Y(doorY)} stroke={colorOf(s)} strokeWidth="0.9" />}
          </g>
        )
      })}
      {[...groups.entries()].map(([g, cells]) => {
        const gxm = cells.reduce((a, s) => a + s.x, 0) / cells.length, gym = cells.reduce((a, s) => a + s.y, 0) / cells.length
        return <text key={`gl${g}`} x={X(gxm)} y={Y(gym) + 1} fontSize="2.6" fontWeight="700" textAnchor="middle" fill={INK} stroke="#fff" strokeWidth="0.8" paintOrder="stroke">{g}{cells.length > 1 ? ` ×${cells.length}` : ''}</text>
      })}

      {/* Exit stairs: two flights, treads every run, landings as deep as the stair is wide */}
      {stairs.map((s, i) => {
        const x0 = s.x - enc.a / 2, y0 = s.y - enc.b / 2, x1 = s.x + enc.a / 2, y1 = s.y + enc.b / 2
        const treads: number[] = []
        for (let y = y0 + w; y <= y1 - w + 1e-6; y += egressPresets.tread) treads.push(y)
        return (
          <g key={`st${i}`}>
            <rect x={X(x0)} y={Y(y1)} width={mm(enc.a)} height={mm(enc.b)} fill="#f6dcdb" stroke="#c0504d" strokeWidth="0.35" />
            {treads.map((y, k) => <g key={k}><line x1={X(x0)} y1={Y(y)} x2={X(x0 + w)} y2={Y(y)} stroke="#c0504d" strokeWidth="0.12" /><line x1={X(x1 - w)} y1={Y(y)} x2={X(x1)} y2={Y(y)} stroke="#c0504d" strokeWidth="0.12" /></g>)}
            <line x1={X(x0 + w + 0.05)} y1={Y(y0 + w)} x2={X(x0 + w + 0.05)} y2={Y(y1 - w)} stroke="#c0504d" strokeWidth="0.25" />
            <line x1={X(x0 + w / 2)} y1={Y(y0 + w)} x2={X(x0 + w / 2)} y2={Y(y1 - w * 0.6)} stroke={INK} strokeWidth="0.2" />
            <path d={`M${X(x0 + w / 2) - 0.9},${Y(y1 - w * 0.6) + 1.6} L${X(x0 + w / 2)},${Y(y1 - w * 0.6)} L${X(x0 + w / 2) + 0.9},${Y(y1 - w * 0.6) + 1.6}`} fill="none" stroke={INK} strokeWidth="0.2" />
            <text x={X(s.x)} y={Y(y0 + w / 2) + 0.9} fontSize="2.2" fontWeight="700" textAnchor="middle" fill="#7a2c2a">ES{i + 1}</text>
          </g>
        )
      })}

      {/* Dimensions */}
      <g stroke={INK} strokeWidth="0.18" fill="none">
        <line x1={X(-W / 2)} y1={Y(-D / 2 - 4)} x2={X(W / 2)} y2={Y(-D / 2 - 4)} />
        <line x1={X(-W / 2)} y1={Y(-D / 2 - 0.8)} x2={X(-W / 2)} y2={Y(-D / 2 - 5)} />
        <line x1={X(W / 2)} y1={Y(-D / 2 - 0.8)} x2={X(W / 2)} y2={Y(-D / 2 - 5)} />
        {[-W / 2, W / 2].map((x) => <line key={x} x1={X(x) - 1} y1={Y(-D / 2 - 4) + 1} x2={X(x) + 1} y2={Y(-D / 2 - 4) - 1} strokeWidth="0.35" />)}
        <line x1={X(W / 2 + 4)} y1={Y(D / 2)} x2={X(W / 2 + 4)} y2={Y(-D / 2)} />
        <line x1={X(W / 2 + 0.8)} y1={Y(D / 2)} x2={X(W / 2 + 5)} y2={Y(D / 2)} />
        <line x1={X(W / 2 + 0.8)} y1={Y(-D / 2)} x2={X(W / 2 + 5)} y2={Y(-D / 2)} />
        {[-D / 2, D / 2].map((y) => <line key={y} x1={X(W / 2 + 4) - 1} y1={Y(y) + 1} x2={X(W / 2 + 4) + 1} y2={Y(y) - 1} strokeWidth="0.35" />)}
      </g>
      <text x={X(0)} y={Y(-D / 2 - 4) - 1.2} fontSize="2.8" textAnchor="middle" fill={INK}><U>{`${W.toFixed(1)} m`}</U></text>
      <text x={X(W / 2 + 4) - 1.2} y={Y(0)} fontSize="2.8" textAnchor="middle" fill={INK} transform={`rotate(-90 ${X(W / 2 + 4) - 1.2} ${Y(0)})`}><U>{`${D.toFixed(1)} m`}</U></text>
      <text x={X(0)} y={Y(-c / 2) + 3.6} fontSize="2.2" textAnchor="middle" fill={INK}><U>{`Core ${c.toFixed(1)} m × ${c.toFixed(1)} m`}</U></text>

      {/* Floor data, inside the plate */}
      <g fontSize="2.6" fill={INK}>
        <text x={X(-W / 2 + 1.5)} y={Y(D / 2 - 1.5) + 3.4} fontSize="3.4" fontWeight="700">{label.toUpperCase()} · LEVEL {f.level}</text>
        <text x={X(-W / 2 + 1.5)} y={Y(D / 2 - 1.5) + 7.4}><U>{`Gross ${fmt(f.area)} m² · net ${fmt(net)} m² (${Math.round((net / Math.max(1, f.area)) * 100)}%)`}</U></text>
        <text x={X(-W / 2 + 1.5)} y={Y(D / 2 - 1.5) + 10.8}><U>{`Occupant load ${fmt(storey.load)} (${storey.basis})`}</U></text>
        {room && <text x={X(-W / 2 + 1.5)} y={Y(D / 2 - 1.5) + 14.2} fill="#6d3f8a">{room.postedLimit != null ? `Posted limit ${fmt(room.postedLimit)} visitors` : `${Math.round(room.visitorShare * 100)}% of the floor open to visitors`} · {room.free ? 'free' : 'ticketed'}, {room.hoursOpen} h a day</text>}
        {moved && <text x={X(-W / 2 + 1.5)} y={Y(-D / 2 + 1.5) - 1} fill="#7a4b00" data-block-offset=""><U>{`Block ${blk!.name ?? ''} drawn centred on the core; in the model it is shifted ${blk!.dx.toFixed(1)} m, ${blk!.dy.toFixed(1)} m and turned ${blk!.rotation.toFixed(0)}°`}</U></text>}
      </g>

      {/* Scale bar */}
      <g transform={`translate(${AREA.x + 4} ${SHEET.h - 26})`}>
        {bar.slice(0, -1).map((v, i) => <rect key={v} x={barMm(v)} y="0" width={barMm(bar[i + 1]) - barMm(v)} height="1.6" fill={i % 2 ? '#fff' : INK} stroke={INK} strokeWidth="0.2" />)}
        {bar.map((v) => <text key={v} x={barMm(v)} y="5" fontSize="2.4" textAnchor="middle" fill={INK}>{v}</text>)}
        <text x={barMm(bar[bar.length - 1]) + 3} y="1.8" fontSize="2.4" fill={INK}>{ftBar ? 'ft' : 'm'}</text>
        <text x="0" y="10" fontSize="2.8" fontWeight="700" fill={INK}>1:{scale} at A2 (594 × 420 mm)</text>
      </g>

      {/* Right column: title, north, level key, legend, title block */}
      <text x={COL.x} y="24" fontSize="6" fontWeight="700" fill={INK}>{d.typical ? 'TYPICAL FLOOR PLAN' : 'FLOOR PLAN'}</text>
      <text x={COL.x} y="31" fontSize="3.4" fill={INK}><U>{`Level ${f.level} · ${label} · +${f.z0.toFixed(1)} m`}</U></text>
      <text x={COL.x} y="36" fontSize="2.6" fill="#6b6f76">Exit stairs {PLACEMENT_LABEL[t.stairPlacement ?? 'core']}</text>
      <g transform={`translate(${COL.x + COL.w - 12} 56)`}>
        <circle r="9" fill="none" stroke={INK} strokeWidth="0.3" />
        <g transform={`rotate(${north})`}><path d="M0 -8 L3 4 L0 1.6 L-3 4 Z" fill={INK} /><text y="-10.5" fontSize="3.2" fontWeight="700" textAnchor="middle" fill={INK}>N</text></g>
      </g>
      <text x={COL.x} y="52" fontSize="2.4" fill="#6b6f76">{project === 'vtc' ? 'True north 45° from the model grid' : 'Grid north'}</text>

      <text x={COL.x} y={keyY - 4} fontSize="2.6" fontWeight="700" fill={INK}>LEVEL KEY</text>
      {tower.map((x, i) => (
        <rect key={x.level} x={COL.x} y={keyY + keyH - (i + 1) * kh} width="16" height={Math.max(kh - 0.15, 0.2)} fill={x.use === 'mechanical' ? '#a3a3a3' : x.skyLobby ? (t.skyRoom?.level === x.level ? '#8e5ba8' : '#2a8f86') : USES[x.use].color} opacity={x.podium ? 0.6 : 0.9} />
      ))}
      {(() => { const i = tower.findIndex((x) => x.level === f.level); const yy = keyY + keyH - (i + 0.5) * kh; return (
        <g><path d={`M${COL.x + 17} ${yy} l4 -2 v4 Z`} fill={INK} /><line x1={COL.x - 1} y1={yy} x2={COL.x + 17} y2={yy} stroke={INK} strokeWidth="0.4" />
          <text x={COL.x + 23} y={yy + 1.1} fontSize="2.8" fontWeight="700" fill={INK}>L{f.level}</text></g>
      ) })()}
      <text x={COL.x + 23} y={keyY + 3} fontSize="2.2" fill="#6b6f76">L{tower[tower.length - 1]?.level} top</text>
      <text x={COL.x + 23} y={keyY + keyH} fontSize="2.2" fill="#6b6f76">L{tower[0]?.level} grade</text>

      <g transform={`translate(${COL.x} ${keyY + keyH + 12})`} fontSize="2.4" fill={INK}>
        <text y="0" fontSize="2.6" fontWeight="700">LEGEND</text>
        <rect y="3" width="6" height="3.4" fill="#2b2f36" /><text x="9" y="5.9"><U>Core walls (400 mm, indicative)</U></text>
        <rect y="9" width="6" height="3.4" fill={GROUP_COLOR.office} fillOpacity="0.28" stroke={INK} strokeWidth="0.2" /><line x1="0" y1="9" x2="6" y2="12.4" stroke={INK} strokeWidth="0.12" /><text x="9" y="11.9">Lift shaft, group label (R rise, S shuttle)</text>
        <line x1="0" y1="16.5" x2="6" y2="16.5" stroke={GROUP_COLOR.office} strokeWidth="0.9" /><text x="9" y="17.6">Lift door: cars stop on this floor</text>
        <rect y="20.5" width="6" height="3.4" fill="#f6dcdb" stroke="#c0504d" strokeWidth="0.3" /><text x="9" y="23.4"><U>{`Exit stair (ES), ${fmt(storey.stairMm)} mm clear`}</U></text>
        <rect y="26.5" width="6" height="3.4" fill={GROUP_COLOR.service} fillOpacity="0.28" stroke={INK} strokeWidth="0.2" /><text x="9" y="29.4">FF firefighter lift · SV service lift</text>
        {t.skyRoom && <><rect y="32.5" width="6" height="3.4" fill="#8e5ba8" fillOpacity="0.3" /><text x="9" y="35.4">Public sky room (level {t.skyRoom.level})</text></>}
      </g>

      <g transform={`translate(${COL.x} ${keyY + keyH + 56})`} fontSize="2.4" fill={INK}>
        <text y="0" fontSize="2.6" fontWeight="700">FLOOR DATA</text>
        {[
          ['Gross floor area', `${fmt(f.area)} m²`],
          ['Core', `${fmt(coreArea)} m² (${(t.coreShare * 100).toFixed(1)}% of the tower plate)`],
          ...(edgeStairArea > 0 ? [['Stairs at the edge', `${fmt(edgeStairArea)} m²`]] : []),
          ['Net area', `${fmt(net)} m² (${Math.round((net / Math.max(1, f.area)) * 100)}%)`],
          ['Occupant load', `${fmt(storey.load)} people`],
          ...(lay?.kind === 'homes' ? [['Homes (layout)', `${lay.homes}: ${(['studio', 'one', 'two', 'three'] as const).filter((u) => lay.units[u]).map((u) => `${lay.units[u]} × ${UNIT_SHORT[u]}`).join(', ')}`]] : []),
          ...(lay?.kind === 'hotel' ? [['Hotel keys (layout)', `${lay.keys}, ${Math.round(lay.m2PerKey)} m² each incl. corridor`]] : []),
          ['Lifts stopping here', [...groups.entries()].filter(([, cells]) => cells.some((s) => s.stops.has(f.level) && s.cls !== 'service')).map(([g]) => g).join(', ') || 'none'],
          ['Exit stairs', `${Math.max(2, Math.round(egressPresets.stairs))} × ${fmt(storey.stairMm)} mm clear`],
        ].map(([k, v], i) => (
          <g key={k}><text y={5 + i * 4.4} fill="#6b6f76">{k}</text><text x="34" y={5 + i * 4.4}><U>{v}</U></text></g>
        ))}
      </g>

      <g transform={`translate(${COL.x} ${SHEET.h - 62})`} fontSize="2.4" fill={INK}>
        <rect x="-2" y="-4" width={COL.w + 4} height="50" fill="none" stroke={INK} strokeWidth="0.3" />
        {[
          ['Drawing', `${d.typical ? 'Typical floor plan' : 'Floor plan'}, level ${f.level}`],
          ['Scale', `1:${scale} at A2`],
          ['Stage', 'Schematic · LOD 100 (space reservation)'],
          ['Date', today],
        ].map(([k, v], i) => (
          <g key={k}><text y={1 + i * 5.2} fill="#6b6f76">{k}</text><text x="20" y={1 + i * 5.2}>{v}</text></g>
        ))}
        <text y="23.5" fontSize="2.1" fill="#6b6f76">Core, lift shafts and stairs come from the core &amp; lift and</text>
        <text y="26.6" fontSize="2.1" fill="#6b6f76">egress checks on team presets. Grid indicative; structure</text>
        <text y="29.7" fontSize="2.1" fill="#6b6f76">not sized. Study drawing, not for construction.</text>
        {layout.overflow > 0 && <text y="34.4" fontSize="2.2" fill="#c0392b">{layout.overflow} shaft{layout.overflow > 1 ? 's' : ''} do not fit the core (dashed red).</text>}
      </g>
    </svg>
  )
}
