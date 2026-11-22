// Inspector for Green and shared levels up the tower (book node #18): the tower as one section stick, planted levels on
// its left, shared levels on its right, and each side's largest gap bracketed with its storeys; the rule lines fold below.
import { useMemo } from 'react'
import { skyVillages, type LevelList } from '../engine/skyVillages'
import { towerFloors } from '../engine/massing'
import { USES } from '../engine/types'
import { trueNorthDeg } from '../lib/northView'
import { useStore, useTowers } from '../store'
import { Section, StateChip } from './ui'
import { Fold, RuleRows } from './ResultViz'

const PLANTED = '#5f9a4f', SHARED = USES.amenity.color
const W = 220, H = 180, TOP = 8, BOT = 8, X0 = 92, X1 = 128

function Side({ l, side, y, color }: { l: LevelList; side: 'l' | 'r'; y: (z: number) => number; color: string }) {
  const xa = side === 'l' ? X0 - 14 : X1, xb = side === 'l' ? X0 : X1 + 14
  const g = l.largest
  const bx = side === 'l' ? X0 - 24 : X1 + 24
  return (
    <g>
      {l.marks.map((m) => <line key={m.level} x1={xa} x2={xb} y1={y(m.z)} y2={y(m.z)} stroke={color} strokeWidth={2.5}><title>{`L${m.level} +${Math.round(m.z)} m: ${m.what.join(', ')}`}</title></line>)}
      {g && <g>
        <path d={`M${bx + (side === 'l' ? 4 : -4)} ${y(g.from.z)}H${bx}V${y(g.to.z)}H${bx + (side === 'l' ? 4 : -4)}`} fill="none" stroke={color} strokeDasharray="3 2" strokeWidth={1.2} />
        <text x={side === 'l' ? bx - 4 : bx + 4} y={(y(g.from.z) + y(g.to.z)) / 2} textAnchor={side === 'l' ? 'end' : 'start'} dominantBaseline="middle" className="fill-current text-meta tabular-nums">{g.storeys} st</text>
      </g>}
    </g>
  )
}

export default function SkyVillagesPanel() {
  const towers = useTowers()
  const selected = useStore((s) => s.selectedTower)
  const project = useStore((s) => s.project)
  const homeM2 = useStore((s) => s.liftPresets.homeM2)
  const t = towers.find((x) => x.id === selected) ?? towers[0]
  const r = useMemo(() => (t ? skyVillages(t, towerFloors(t), { north: trueNorthDeg(project), homeM2 }) : null), [t, project, homeM2])
  if (!t || !r) return null
  const top = Math.max(1, r.planted.roof.z)
  const y = (z: number) => TOP + (1 - z / top) * (H - TOP - BOT)
  const line = (id: string) => r.rules.find((x) => x.id === id)
  const planted = line('sv-planted'), shared = line('sv-shared')
  return (
    <Section title={`Green and shared levels · ${t.name}`} help="Planted levels (left) and shared levels (right) from grade to the roof, with each side's largest gap in storeys. Precedent: about every 10 storeys, about 25 at most.">
      <div className="flex min-w-0 items-start gap-3">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-44 w-auto shrink-0 text-muted" role="img" aria-label={`Planted levels: largest gap ${r.planted.largest?.storeys ?? 0} storeys. Shared levels: largest gap ${r.shared.largest?.storeys ?? 0} storeys.`}>
          <rect x={X0} y={y(top)} width={X1 - X0} height={y(0) - y(top)} rx={2} className="fill-current" opacity={0.18} />
          <line x1={X0 - 30} x2={X1 + 30} y1={y(0)} y2={y(0)} className="stroke-current" strokeWidth={1} />
          <Side l={r.planted} side="l" y={y} color={PLANTED} />
          <Side l={r.shared} side="r" y={y} color={SHARED} />
        </svg>
        <div className="grid min-w-0 gap-2 text-meta">
          <div className="min-w-0"><div className="flex items-center gap-2"><span className="inline-block h-2 w-2 rounded-full" style={{ background: PLANTED }} /><span className="font-semibold">Planted</span>{planted && <StateChip state={planted.state} />}</div>
            <b className="text-control tabular-nums">{r.planted.largest?.storeys ?? 0} storeys</b> <span className="text-muted">largest gap · {r.planted.marks.length} level{r.planted.marks.length === 1 ? '' : 's'}</span></div>
          <div className="min-w-0"><div className="flex items-center gap-2"><span className="inline-block h-2 w-2 rounded-full" style={{ background: SHARED }} /><span className="font-semibold">Shared</span>{shared && <StateChip state={shared.state} />}</div>
            <b className="text-control tabular-nums">{r.shared.largest?.storeys ?? 0} storeys</b> <span className="text-muted">largest gap · {r.shared.marks.length} level{r.shared.marks.length === 1 ? '' : 's'}</span></div>
          {r.homes > 0 && <div className="min-w-0"><b className="text-control tabular-nums">{r.shared.marks.length ? Math.round(r.homes / r.shared.marks.length) : '—'}</b> <span className="text-muted">homes per shared level (SkyVille about 80)</span></div>}
        </div>
      </div>
      <div className="mt-3"><Fold title={`${r.rules.length} rule lines`}><RuleRows rules={r.rules} /></Fold></div>
    </Section>
  )
}
