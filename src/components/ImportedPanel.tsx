// Side panel for an imported tower (research P14-M03 north and datum, M04 storeys and program tags, M05 health).
// Replaces the box fields; the Schematic tools (core, plant floors, sky lobbies) keep working on the sliced storeys.
import { Compass, Eye, EyeOff, FileUp, Layers, RotateCcw, Ruler, Square } from './icons'
import { useMemo, useState, type ReactNode } from 'react'
import { PROGRAM_ICONS } from '../data/icons'
import { VTC_NORTH_DEG } from '../context'
import { plateSumCheck, tagByBands, towerPatch, typicalPlate } from '../engine/imported'
import { USES, type Flag, type Tower, type UseId } from '../engine/types'
import { MAGNETIC_DECLINATION, STREET_GRID_NORTH } from '../lib/import/pipeline'
import { resliceTower, setTowerNorth, tagStoreys, useImportStore, useMeshEntry } from '../lib/import/store'
import { useStore } from '../store'
import { HealthList } from './ImportHealth'
import { FlagChip, Section } from './ui'
import { fieldUnit, useUnits } from '../lib/units'

export default function ImportedPanel({ t }: { t: Tower }) {
  const m = t.imported!
  const entry = useMeshEntry(m.meshId)
  const showProblems = useImportStore((s) => s.showProblems)
  const project = useStore((s) => s.project)
  const updateTower = useStore((s) => s.updateTower)
  const [sel, setSel] = useState<number[]>([])
  const [anchor, setAnchor] = useState<number | null>(null)
  const [northOpen, setNorthOpen] = useState(false)
  const [customN, setCustomN] = useState(0)
  const floored = m.storeys.filter((s) => s.hasFloor)
  const gfa = floored.reduce((a, s) => a + s.area, 0)
  const check = plateSumCheck(m)
  const projectNorth = project === 'vtc' ? VTC_NORTH_DEG : 0
  const unitFlag: Flag = m.unitSource === 'file' ? 'verified' : m.unitSource === 'confirmed' ? 'team_assumption' : 'unverified'
  const levels = useMemo(() => [...m.storeys].reverse(), [m.storeys])
  const pick = (lv: number, shift: boolean) => {
    if (shift && anchor != null) { const [a, b] = [Math.min(anchor, lv), Math.max(anchor, lv)]; setSel(m.storeys.filter((s) => s.level >= a && s.level <= b).map((s) => s.level)) }
    else { setSel((x) => (x.includes(lv) && x.length === 1 ? [] : [lv])); setAnchor(lv) }
  }
  const reslice = (patch: { f2f?: number; podiumTop?: number; podiumF2F?: number }) => { if (!resliceTower(t, patch)) alert('The mesh is not loaded in this session: import the file again to re-slice.') }

  return (
    <>
      <Section title={`Imported massing: ${t.name}`} right={<button onClick={() => useImportStore.getState().openDialog(null, t.id)} className="flex items-center gap-1 text-meta text-accent hover:underline"><FileUp size={12} />Re-import</button>}>
        <div className="grid gap-2 text-xs">
          <div className="truncate text-meta text-muted" title={m.fileName}>{m.fileName} · {m.format.toUpperCase()}{entry ? ` · ${entry.report.triangles.toLocaleString()} triangles` : ' · mesh not loaded (plates shown)'}</div>
          <Row icon={<Ruler size={13} />} label="Units" value={`${m.unit} (${m.unitSource === 'file' ? 'read from the file' : m.unitSource === 'confirmed' ? 'confirmed on import' : 'chosen'})`} flag={unitFlag} />
          <Row icon={<Compass size={13} />} label="North" value={m.fileNorthDeg == null ? 'Unresolved: the file does not say' : `${m.fileNorthDeg}° from file +Y · turned ${t.rotation.toFixed(1)}°`} flag={m.fileNorthDeg == null ? 'unresolved' : 'team_assumption'}
            action={<button onClick={() => setNorthOpen((v) => !v)} className="text-meta text-accent hover:underline">{m.fileNorthDeg == null ? 'Set north' : 'Change'}</button>} />
          {northOpen && (
            <div className="grid gap-1 rounded-md border border-line bg-black/[0.02] p-2 text-meta">
              <button className="text-left hover:text-accent" onClick={() => { setTowerNorth(t, projectNorth, `Same frame as the project's base model (${projectNorth}°)`); setNorthOpen(false) }}>Same frame as this project's base model ({projectNorth}°)</button>
              <button className="text-left hover:text-accent" onClick={() => { setTowerNorth(t, 0, 'File +Y points to true north'); setNorthOpen(false) }}>File +Y points to true north (0°)</button>
              <button className="text-left hover:text-accent" onClick={() => { setTowerNorth(t, STREET_GRID_NORTH, `Downtown street grid, north-west (${STREET_GRID_NORTH}°, derived, unverified)`); setNorthOpen(false) }}>Downtown street grid, +Y north-west ({STREET_GRID_NORTH}°, unverified)</button>
              <button className="text-left hover:text-accent" onClick={() => { setTowerNorth(t, -MAGNETIC_DECLINATION, `File +Y is magnetic north (declination ${MAGNETIC_DECLINATION}° east, WMM2025, unverified)`); setNorthOpen(false) }}>File +Y is magnetic north (−{MAGNETIC_DECLINATION}°, unverified)</button>
              <span className="flex items-center gap-1">True north
                <input type="number" step={0.5} value={customN} onChange={(e) => setCustomN(Number(e.target.value))} className="w-14 rounded border border-line px-1 py-0.5 text-right tabular-nums" aria-label="North angle" />° clockwise from +Y
                <button className="ml-auto rounded bg-accent px-2 py-0.5 text-white" onClick={() => { setTowerNorth(t, customN, `Entered by hand (${customN}°)`); setNorthOpen(false) }}>Set</button>
              </span>
              {m.fileNorthDeg != null && <button className="text-left text-muted hover:text-ink" onClick={() => { setTowerNorth(t, null, 'Unresolved: cleared by the user'); setNorthOpen(false) }}>Mark unresolved again</button>}
            </div>
          )}
          <Row icon={<Layers size={13} />} label="Zero level" value={m.datumSource} flag="team_assumption" />
        </div>
      </Section>

      <Section title="Storeys (sliced)" right={<FlagChip flag="team_assumption" />}>
        <div className="grid gap-2">
          <div className="grid grid-cols-3 gap-2 text-xs">
            <Num label="Floor-to-floor" value={m.f2f} step={0.1} onCommit={(v) => reslice({ f2f: v })} disabled={!entry} />
            <Num label="Podium top" value={m.podiumTop} step={0.5} onCommit={(v) => reslice({ podiumTop: v })} disabled={!entry} />
            <Num label="Podium storey" value={m.podiumF2F} step={0.1} onCommit={(v) => reslice({ podiumF2F: v })} disabled={!entry} />
          </div>
          <div className="grid grid-cols-3 gap-2 rounded-md bg-black/[0.03] p-2 text-meta">
            <div><div className="text-muted">Storeys</div><div className="font-semibold tabular-nums">{floored.length}{m.storeys.length > floored.length ? ` +${m.storeys.length - floored.length} void` : ''}</div></div>
            <div><div className="text-muted">Gross area</div><div className="font-semibold tabular-nums">{Math.round(gfa).toLocaleString()} m²</div></div>
            <div title="Plates × storey height against the mesh volume (P14-M04): ≤ 0.5% good, > 2% poor (team presets)"><div className="text-muted">Plate-sum check</div>
              <div className={`font-semibold tabular-nums ${!check ? 'text-muted' : Math.abs(check.error) <= 0.005 ? 'text-emerald-700' : Math.abs(check.error) > 0.02 ? 'text-red-700' : 'text-[#8a5a00]'}`}>{check ? `${(Math.abs(check.error) < 5e-5 ? 0 : check.error * 100).toFixed(2)}%` : 'n/a (open mesh)'}</div></div>
          </div>
          <p className="text-meta text-muted">Typical plate {Math.round(typicalPlate(m.storeys)).toLocaleString()} m². Core, lifts and stairs size from area, using a {t.width} × {t.depth} m rectangle of the same area (team assumption); view cones and the site check use the real outline.</p>
        </div>
      </Section>

      <Section title="Program by storey" right={<button onClick={() => updateTower(t.id, towerPatch({ ...m, storeys: tagByBands(m.storeys, t.bands.length ? t.bands : [{ use: 'office', share: 1 }], m.storeys.find((s) => s.podium)?.use ?? 'retail') }))} className="text-meta text-accent hover:underline" title="Spread the tower's program bands over the tower storeys">Apply bands</button>}>
        <div className="mb-2 flex flex-wrap items-center gap-1.5 text-meta">
          <span className="text-muted">{sel.length ? `${sel.length} selected` : 'Click a storey, shift-click for a range'}</span>
          <select disabled={!sel.length} value="" onChange={(e) => { tagStoreys(t, sel, { use: e.target.value as UseId }); }} className="rounded border border-line bg-panel px-1 py-0.5 text-meta disabled:opacity-40" aria-label="Tag selected storeys">
            <option value="" disabled>Tag as…</option>
            {Object.entries(USES).map(([id, u]) => <option key={id} value={id}>{u.label}</option>)}
          </select>
          <button disabled={!sel.length} onClick={() => tagStoreys(t, sel, { hasFloor: false })} className="rounded border border-line px-1.5 py-0.5 disabled:opacity-40" title="Atrium, double-height space or crown: kept in the schedule, out of floor area">No floor</button>
          <button disabled={!sel.length} onClick={() => tagStoreys(t, sel, { hasFloor: true })} className="rounded border border-line px-1.5 py-0.5 disabled:opacity-40">Has floor</button>
          <button disabled={!sel.length} onClick={() => tagStoreys(t, sel, { podium: !m.storeys.find((s) => s.level === sel[0])?.podium })} className="rounded border border-line px-1.5 py-0.5 disabled:opacity-40">Podium / tower</button>
        </div>
        <div className="max-h-64 overflow-y-auto rounded-md border border-line" role="listbox" aria-multiselectable="true" aria-label="Storeys, top first">
          {levels.map((s) => {
            const Icon = PROGRAM_ICONS[s.use]
            const on = sel.includes(s.level)
            return (
              <div key={s.level} role="option" aria-selected={on} tabIndex={0} onClick={(e) => pick(s.level, e.shiftKey)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(s.level, e.shiftKey) } }}
                className={`flex cursor-pointer items-center gap-2 border-b border-line/60 px-2 py-0.5 text-meta last:border-0 ${on ? 'bg-accent/10' : 'hover:bg-black/[0.03]'}`}>
                <span className="w-8 tabular-nums text-muted">L{s.level}</span>
                <span className="w-12 tabular-nums text-muted">+{s.z0.toFixed(1)}</span>
                {s.hasFloor
                  ? <span className="flex h-4 w-4 items-center justify-center rounded text-white" style={{ background: USES[s.use].color }}><Icon size={10} /></span>
                  : <span className="flex h-4 w-4 items-center justify-center rounded border border-dashed border-slate-400 text-slate-400"><Square size={8} /></span>}
                <span className={`flex-1 truncate ${s.hasFloor ? '' : 'text-muted line-through'}`}>{s.hasFloor ? USES[s.use].label : 'No floor'}{s.podium ? ' · podium' : ''}</span>
                <span className="tabular-nums">{Math.round(s.area).toLocaleString()} m²</span>
              </div>
            )
          })}
        </div>
        <p className="mt-1 text-meta text-muted">Tags are the designer's call (P14-M04); plates under 25 m² start as "no floor" (spire or crown, team assumption).</p>
      </Section>

      <Section title="Geometry health" right={entry && <button onClick={() => useImportStore.setState({ showProblems: !showProblems })} className="flex items-center gap-1 text-meta text-accent hover:underline">{showProblems ? <EyeOff size={12} /> : <Eye size={12} />}{showProblems ? 'Hide' : 'Show'} in 3D</button>}>
        {entry?.health.length ? <HealthList items={entry.health} compact /> : <p className="text-meta text-muted">{m.health.block + m.health.warn ? `${m.health.warn} warning(s) at import.` : 'No problems at import.'} Re-import to see the full report.</p>}
        <button onClick={() => { if (confirm('Turn this tower back into a parametric box of the same plate area? The imported storeys and tags are dropped (the file is not touched).')) updateTower(t.id, { imported: undefined, podiumHeight: 0 }) }}
          className="mt-2 flex items-center gap-1 text-meta text-muted hover:text-red-700"><RotateCcw size={12} />Back to a parametric box</button>
      </Section>
    </>
  )
}

function Row({ icon, label, value, flag, action }: { icon: ReactNode; label: string; value: string; flag: Flag; action?: ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 text-accent">{icon}</span>
      <div className="min-w-0 flex-1"><div className="text-muted">{label}</div><div className="text-meta">{value}</div></div>
      <div className="flex shrink-0 flex-col items-end gap-1"><FlagChip flag={flag} />{action}</div>
    </div>
  )
}

/** Number field that re-slices on Enter or blur, not on every keystroke. */
function Num({ label, value, step, onCommit, disabled }: { label: string; value: number; step: number; onCommit: (v: number) => void; disabled?: boolean }) {
  // Metres stored; shown and typed in the viewer's display unit (lib/units.ts).
  const f = fieldUnit('m', useUnits((st) => st.unit))
  // Shown to 3 decimals in a converted unit; only a different number typed is committed, so nothing drifts.
  const shown = f ? Math.round(f.toShown(value) * 1000) / 1000 : value
  const [v, setV] = useState(String(shown))
  const [last, setLast] = useState(shown)
  if (last !== shown) { setLast(shown); setV(String(shown)) }
  const commit = () => { const n = Number(v); if (Number.isFinite(n) && n !== shown) onCommit(f ? f.fromShown(n) : n) }
  return (
    <label className="grid gap-1"><span className="text-muted">{label}</span>
      <span className="flex items-center gap-1">
        <input type="number" step={f ? 'any' : step} value={v} disabled={disabled} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit() }}
          className="w-16 rounded border border-line bg-panel px-1 py-0.5 text-right tabular-nums disabled:opacity-50" aria-label={label} />{f ? f.label : 'm'}
      </span>
    </label>
  )
}
