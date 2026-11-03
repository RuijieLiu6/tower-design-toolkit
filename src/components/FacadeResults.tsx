// Facade node results (research P12-M06a/b): inputs, an unrolled elevation of the selected tower (the facade pattern
// study), WWR by facing, and the glazing checks with flags and sources.
import { useMemo } from 'react'
import { SYSTEMS, zoneTop, type Face, type FacadeSystem, type Quadrant } from '../engine/facade'
import { towerFloors } from '../engine/massing'
import type { RuleResult } from '../engine/types'
import { useFacade } from '../hooks/useFacade'
import { useFacadeStore } from '../lib/facadeStore'
import { useStore, useTowers } from '../store'
import { FlagChip, Section, StateChip } from './ui'
import { U } from './Units'

function Card({ r }: { r: RuleResult }) {
  return (
    <div className="rounded-md border border-line p-2">
      <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold">{r.label}</span><StateChip state={r.state} /></div>
      <div className="mt-0.5 text-[11px]"><b><U>{r.value}</U></b> <span className="text-muted">· <U>{r.threshold}</U></span></div>
      {r.note && <div className="mt-0.5 text-[11px] text-slate-600"><U>{r.note}</U></div>}
      <div className="mt-1 flex flex-wrap items-center gap-1"><FlagChip flag={r.flag} />
        {r.source.url ? <a href={r.source.url} target="_blank" rel="noreferrer" className="text-[10px] text-muted hover:text-accent">{r.source.label}</a> : <span className="text-[10px] text-muted">{r.source.label}</span>}
      </div>
    </div>
  )
}

function Pct({ label, value, onChange, placeholder }: { label: string; value: number | null; onChange: (v: number | null) => void; placeholder?: string }) {
  return (
    <label className="grid gap-0.5 text-[11px]"><span className="text-muted">{label}</span>
      <span className="flex items-center gap-1"><input type="number" min={0} max={100} step={1} value={value == null ? '' : Math.round(value * 100)} placeholder={placeholder ?? '–'}
        onChange={(e) => onChange(e.target.value === '' ? null : Math.min(100, Math.max(0, Number(e.target.value))) / 100)}
        className="w-16 rounded border border-line bg-panel px-1 py-0.5 text-right tabular-nums" aria-label={label} />%</span>
    </label>
  )
}

export default function FacadeResults() {
  const r = useFacade()
  const f = useFacadeStore()
  const towers = useTowers()
  const selected = useStore((s) => s.selectedTower)
  const t = towers.find((x) => x.id === selected) ?? towers[0]
  const preset = SYSTEMS[f.system].wwr
  return (
    <>
      <Section title="Facade system and glazing" right={<FlagChip flag="team_assumption" />}>
        <label className="flex items-center justify-between gap-2 text-xs"><span className="text-muted">System</span>
          <select value={f.system} onChange={(e) => f.set({ system: e.target.value as FacadeSystem })} className="rounded border border-line bg-panel px-1.5 py-0.5 text-[11px]">
            {(Object.keys(SYSTEMS) as FacadeSystem[]).map((k) => <option key={k} value={k}>{SYSTEMS[k].label}</option>)}
          </select>
        </label>
        <p className="mt-0.5 text-[10px] text-muted">{SYSTEMS[f.system].note}. Preset window-to-wall ratio {Math.round(preset * 100)}% (team preset).</p>
        <div className="mt-2 grid grid-cols-4 gap-2">
          {(['N', 'E', 'S', 'W'] as Quadrant[]).map((q) => <Pct key={q} label={`WWR facing ${q}`} value={f.wwr[q]} placeholder={String(Math.round(preset * 100))} onChange={(v) => f.set({ wwr: { ...f.wwr, [q]: v } })} />)}
        </div>
        <div className="mt-2 grid grid-cols-4 gap-2">
          <Pct label="Treated glass in bird zone" value={f.treated} onChange={(v) => f.set({ treated: v })} />
          <label className="grid gap-0.5 text-[11px]"><span className="text-muted">Tallest vegetation</span>
            <span className="flex items-center gap-1"><input type="number" min={0} step={1} value={f.vegetation} onChange={(e) => f.set({ vegetation: Math.max(0, Number(e.target.value)) })} className="w-14 rounded border border-line bg-panel px-1 py-0.5 text-right tabular-nums" aria-label="Tallest vegetation" />m</span>
          </label>
          <Pct label="Glass VLT" value={f.vlt} onChange={(v) => f.set({ vlt: v })} />
          <label className="grid gap-0.5 text-[11px]"><span className="text-muted">Glass SHGC</span>
            <input type="number" min={0} max={1} step={0.01} value={f.shgc ?? ''} placeholder="–" onChange={(e) => f.set({ shgc: e.target.value === '' ? null : Math.min(1, Math.max(0, Number(e.target.value))) })} className="w-16 rounded border border-line bg-panel px-1 py-0.5 text-right tabular-nums" aria-label="Glass SHGC" />
          </label>
        </div>
      </Section>
      {t && <Section title={`Facade pattern: ${t.name}, unrolled`}><Unrolled faces={r.faces.filter((x) => x.tower === t.id)} floors={towerFloors(t)} top={zoneTop(f.vegetation)} treated={f.treated} /></Section>}
      <Section title="Glazing by facing (true north)"><ByBin byBin={r.byBin} /></Section>
      <Section title="Checks"><div className="grid gap-2">{r.rules.map((x) => <Card key={x.id} r={x} />)}</div></Section>
    </>
  )
}

/** The facade unrolled around the plan: vision glass and spandrel per storey, bird-zone line, facing under each face. */
function Unrolled({ faces, floors, top, treated }: { faces: Face[]; floors: ReturnType<typeof towerFloors>; top: number; treated: number | null }) {
  const W = 340, H = 200
  const total = faces.reduce((s, f) => s + f.length, 0) || 1
  const zMax = Math.max(1, ...faces.map((f) => f.z1))
  const kx = (W - 10) / total, kz = (H - 26) / zMax
  const untreatedRisk = treated == null || treated < 0.9
  const strips = useMemo(() => {
    let x = 5
    return faces.map((f) => { const s = { f, x }; x += f.length * kx; return s })
  }, [faces, kx])
  const y = (z: number) => H - 18 - z * kz
  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Unrolled facade: vision glass and spandrel per storey, with the bird-collision zone">
        <defs><pattern id="fa-hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="4" stroke="#d0453a" strokeWidth="1.2" /></pattern></defs>
        {strips.map(({ f, x }, i) => {
          const w = f.length * kx
          const fl = floors.filter((s) => s.z1 > f.z0 + 0.01 && s.z0 < f.z1 - 0.01)
          return (
            <g key={i}>
              <rect x={x} y={y(f.z1)} width={w} height={(f.z1 - f.z0) * kz} fill="#c9ced4" stroke="#59636e" strokeWidth={0.4} />
              {fl.map((s) => {
                const h = (s.z1 - s.z0) * kz, gh = h * f.wwr
                return <rect key={s.level} x={x + 0.3} y={y(s.z1) + (h - gh)} width={Math.max(0, w - 0.6)} height={Math.max(0.2, gh - 0.15)} fill="#9cc3e4" />
              })}
              {untreatedRisk && <rect x={x} y={y(Math.min(top, f.z1))} width={w} height={Math.max(0, (Math.min(top, f.z1) - f.z0) * kz)} fill="url(#fa-hatch)" opacity={0.7} />}
              <text x={x + w / 2} y={H - 6} fontSize={7} textAnchor="middle" fill="#3d434b">{f.bin}{f.binFlips ? '±' : ''}</text>
            </g>
          )
        })}
        <line x1={3} x2={W - 3} y1={y(top)} y2={y(top)} stroke="#d0453a" strokeWidth={0.8} strokeDasharray="3 2" />
        <text x={W - 4} y={y(top) - 2} fontSize={6.5} textAnchor="end" fill="#a3322a">bird zone {top} m</text>
      </svg>
      <p className="text-[10px] text-muted">Blue: vision glass; grey: spandrel and opaque wall; red hatch: glass in the bird zone while less than 90% is treated. "±" marks faces whose facing changes within ±5°. Storeys from the tower's floors.</p>
    </div>
  )
}

function ByBin({ byBin }: { byBin: Record<string, { wall: number; glass: number }> }) {
  const bins = Object.entries(byBin).filter(([, v]) => v.wall > 0)
  const max = Math.max(1, ...bins.map(([, v]) => v.wall))
  return (
    <div className="grid gap-1 text-[11px]">
      {bins.map(([b, v]) => (
        <div key={b} className="grid grid-cols-[28px_1fr_90px] items-center gap-2">
          <span className="font-semibold">{b}</span>
          <div className="relative h-2.5 rounded bg-slate-200"><div className="absolute left-0 top-0 h-2.5 rounded bg-[#9cc3e4]" style={{ width: `${(v.glass / max) * 100}%` }} /><div className="absolute top-0 h-2.5 border-r border-slate-500" style={{ width: `${(v.wall / max) * 100}%` }} /></div>
          <span className="text-right tabular-nums">{Math.round((v.glass / v.wall) * 100)}% · {Math.round(v.glass).toLocaleString()} m²</span>
        </div>
      ))}
      <p className="text-[10px] text-muted">Bar: glass area against the wall area facing that way (8 bins from true north).</p>
    </div>
  )
}
