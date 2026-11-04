// Upload a model (research P14-M02 import, M03 units / north / datum, M05 health, M04 storeys; Rhino upload audit and
// Layer 0 interchange, 3 Nov 2026). Two screens: 1. map layers to roles with a live preview; 2. check units, north,
// datum and health in plain words, then use the model. The file is read in this browser (a Web Worker for .3dm and
// OBJ) and never uploaded. Loaded on demand by ImportHost. Every choice that changes the numbers is shown; nothing is assumed.
import { ArrowLeft, ArrowRight, CircleAlert, CircleCheck, Compass, FileUp, Info, Layers, Loader2, Lock, Ruler, ScanLine, TriangleAlert, Upload, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { VTC_NORTH_DEG } from '../context'
import { fmtLen, unitCandidates, UNIT_LABEL, UNIT_SCALE } from '../engine/meshHealth'
import { bounds, mergeMeshes, type MeshData } from '../engine/importGeom'
import { USES, type ImportedStorey } from '../engine/types'
import { ACCEPT, isCancelled, readModelFile, type LoadedImport } from '../lib/import/load'
import { DATUM_LABEL, MAGNETIC_DECLINATION, NORTH_LABEL, STREET_GRID_NORTH, type DatumMode, type ImportOptions, type NorthMode, type Placement, type ProjectFrame } from '../lib/import/pipeline'
import { useImportStore } from '../lib/import/store'
import { FORMAT_LABEL, FORMATS } from '../lib/import/types'
import { applyModel, type ApplyMode } from '../lib/interchange/apply'
import { canLink, pickLinkedFile, startLink, type FileHandleLike } from '../lib/interchange/live'
import { buildModel, defaultOptions } from '../lib/interchange/build'
import { autoMapping, itemsOf, recallMapping, roleOf } from '../lib/interchange/mapping'
import { MASSING_ROLES, type Mapping, type ModelCheck } from '../lib/interchange/model'
import { CITY_ORIGIN, useStore, useTowers } from '../store'
import { HealthList } from './ImportHealth'
import RoleMapper, { useShapes } from './import/RoleMapper'
import { AlignBlock, CityAlign } from './import/Align'
import { useHideUnderDesign } from './CityContext'
import { FlagChip } from './ui'

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
/** Above this a file is "large": the dialog says so (the reader still runs, in the worker). */
const LARGE_BYTES = 50 * 1024 * 1024

export default function ImportDialog() {
  const pendingFile = useImportStore((s) => s.pendingFile)
  const replaceId = useImportStore((s) => s.replaceId)
  const close = useImportStore((s) => s.closeDialog)
  const project = useStore((s) => s.project)
  const setProject = useStore((s) => s.setProject)
  const ground = useStore((s) => s.groundElevation)
  const towers = useTowers()
  const prior = useStore((s) => s.models[s.project])
  const priorTowers = towers.filter((t) => prior && t.imported?.source?.modelId === prior.id).length
  const liftPresets = useStore((s) => s.liftPresets)
  const egressPresets = useStore((s) => s.egressPresets)
  const selectedId = useStore((s) => s.selectedTower)
  const sel = towers.find((t) => t.id === selectedId) ?? towers[0]
  const panel = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const [raw, setRaw] = useState<LoadedImport | null>(null)
  const [file, setFile] = useState<{ name: string; size: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState<{ phase: string; done: number; total: number } | null>(null)
  const [opts, setOpts] = useState<ImportOptions | null>(null)
  const [mapping, setMapping] = useState<Mapping | null>(null)
  const [recalled, setRecalled] = useState(false)
  const [step, setStep] = useState<'map' | 'check'>('map')
  const [shown, setShown] = useState(0)
  // Item 11: picking the map point on the preview, keeping the City buildings under the model, and how many there are.
  const [picking, setPicking] = useState(false)
  const [keep, setKeep] = useState(false)
  const [demolishCount, setDemolishCount] = useState(0)
  // A file linked through the browser's file picker (Chrome, Edge): watched for new saves after it is used.
  const [linked, setLinked] = useState<{ handle: FileHandleLike; file: File } | null>(null)
  const up = (patch: Partial<ImportOptions>) => setOpts((o) => (o ? { ...o, ...patch } : o))

  const frame: ProjectFrame = useMemo(() => ({
    project, northDeg: project === 'vtc' ? VTC_NORTH_DEG : 0,
    siteCentre: project === 'vtc' ? [0, 0] : [sel?.x ?? 0, sel?.y ?? 0],
    groundElevation: ground, utmOrigin: project === 'city' ? CITY_ORIGIN : null,
  }), [project, ground, sel?.x, sel?.y])

  const reading = useRef<AbortController | null>(null)
  // Closing the dialog while a file is read cancels the read.
  useEffect(() => () => reading.current?.abort(), [])
  const read = async (f: File, handle: FileHandleLike | null = null) => {
    setLinked(handle ? { handle, file: f } : null)
    reading.current?.abort()
    const ctrl = new AbortController()
    reading.current = ctrl
    setError(null); setRaw(null); setOpts(null); setMapping(null); setStep('map'); setFile({ name: f.name, size: f.size })
    setLoading({ phase: 'Opening the file', done: 0, total: 1 })
    try {
      const r = await readModelFile(f, (p) => { if (!ctrl.signal.aborted) setLoading(p) }, ctrl.signal)
      if (!r.objects.length && !(r.curves ?? []).length) {
        const { explainEmpty } = await import('../lib/interchange/build')
        throw new Error(explainEmpty(r))
      }
      const remembered = recallMapping(r)
      const m = remembered ?? autoMapping(r)
      setRecalled(!!remembered)
      setRaw(r); setMapping(m)
      setOpts(defaultOptions(r, m, frame, sel?.f2f ?? 4.2))
    } catch (e) {
      if (isCancelled(e)) { if (reading.current === ctrl) setFile(null); return }
      setError((e as Error).message || String(e))
    } finally { setLoading(null) }
  }
  useEffect(() => { if (pendingFile) void read(pendingFile) }, [pendingFile]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    panel.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    return () => opener?.focus?.()
  }, [])
  const onKeyDown = (e: KeyboardEvent) => {
    e.stopPropagation()
    if (e.key === 'Escape') { close(); return }
    if (e.key !== 'Tab' || !panel.current) return
    const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
    if (!items.length) return
    const first = items[0], last = items[items.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }

  const shapes = useShapes(raw ?? { format: 'obj', fileName: '', objects: [], skipped: [], unit: null, unitNote: '', upAxis: 'z', upNote: '', fileNorthDeg: null, northNote: '', notes: [] }, opts?.upAxis ?? 'z')
  const massObjects = useMemo(() => (raw && mapping ? itemsOf(raw).filter((it) => MASSING_ROLES.includes(roleOf(it, mapping).role)).flatMap((it) => (it.curve ? [] : [it])) : []), [raw, mapping])
  // The full build (slicing every tower) runs on the check screen only.
  const built = useMemo(() => (raw && opts && mapping && step === 'check'
    ? buildModel({ raw, mapping, opts, frame, bands: sel?.bands ?? [{ use: 'office', share: 1 }], podiumUse: sel?.podiumUse ?? 'retail', takenIds: towers.map((t) => t.id), liftPresets, egressPresets })
    : null), [raw, opts, mapping, step, frame, sel?.bands, sel?.podiumUse, towers, liftPresets, egressPresets])
  const needsUnit = !!opts && !opts.unitConfirmed && !(raw?.unit && raw.unit === opts.unit)
  const blocked = !!built?.blocked
  const one = built?.towers[Math.min(shown, Math.max(0, (built?.towers.length ?? 1) - 1))]

  const use = (mode: ApplyMode) => {
    if (!raw || !built || built.blocked) return
    applyModel(built, raw, mode, mode === 'replace-one' ? replaceId ?? sel?.id ?? null : null)
    if (linked && mapping && opts) startLink(linked.handle, { mapping, opts, project }, linked.file)
    // Buildings under the model: demolished (hidden from views, shadows and roofs) unless the person kept them.
    if (project === 'city' && demolishCount > 0) useHideUnderDesign.setState({ on: !keep })
    close()
  }

  const host = document.querySelector('[data-stage]') ?? document.body
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) close() }}>
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby="imp-title" onKeyDown={onKeyDown}
        className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-panel text-ink shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-white"><FileUp size={18} /></span>
            <div>
              <h2 id="imp-title" className="text-base font-semibold">Upload a model</h2>
              <p className="mt-0.5 text-xs text-muted">Bring in your Rhino model (or OBJ, glTF, IFC). Map its layers to roles, check units, north and the zero level, and every tool on the site runs on it, with each result traced back to your layers.</p>
            </div>
          </div>
          {raw && <Steps step={step} />}
          <button aria-label="Close" onClick={close} className="rounded p-1 text-muted hover:bg-black/5"><X size={18} /></button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {!raw && (
            <div className="grid gap-4 p-5">
              <DropZone loading={loading} file={file} onFile={read} inputRef={input} onCancel={() => { reading.current?.abort(); setLoading(null); setFile(null) }}
                onLink={canLink() ? async () => { const p = await pickLinkedFile(); if (p) void read(p.file, p.handle) } : undefined} />
              {error && <ErrorBox text={error} />}
              <FormatsTable />
            </div>
          )}
          {raw && opts && mapping && (
            <>
              <FileSummary raw={raw} size={file?.size ?? raw.fileSize ?? null} linked={!!linked} onOther={() => { setRaw(null); setOpts(null); setMapping(null); setLinked(null) }} />
              {step === 'map' && <RoleMapper raw={raw} mapping={mapping} onChange={setMapping} shapes={shapes} recalled={recalled} />}
              {step === 'check' && (
                <div className="grid gap-0 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <div className="grid content-start gap-3 border-line p-5 md:border-r">
                    <ProjectBlock project={project} onPick={(p) => setProject(p)} />
                    <UnitsBlock raw={raw} objects={massObjects} opts={opts} up={up} />
                    <PlaceBlock opts={opts} up={up} frame={frame} rawCentre={built?.placed?.rawCentre ?? [0, 0]} minZ={built?.massing?.bounds.min[2] ?? 0} earth={!!raw.earthAnchor && !!frame.utmOrigin} centre={built?.massing ? [(built.massing.bounds.min[0] + built.massing.bounds.max[0]) / 2, (built.massing.bounds.min[1] + built.massing.bounds.max[1]) / 2] : [0, 0]} />
                    <AlignBlock raw={raw} opts={opts} up={up} frame={frame} built={built} picking={picking} setPicking={setPicking} />
                    <NorthBlock raw={raw} opts={opts} up={up} frame={frame} rotation={built?.placed?.rotation ?? 0} />
                    <StoreyBlock opts={opts} up={up} detected={built?.model.towers[0]?.schedule.podiumTop ?? 0} defaultF2F={sel?.f2f ?? 4.2} />
                  </div>
                  <div className="grid content-start gap-3 bg-black/[0.015] p-5">
                    {project === 'city' && built && !built.blocked && <CityAlign built={built} picking={picking} keep={keep} setKeep={setKeep} onCount={setDemolishCount}
                      onPick={(p) => { up({ placement: 'anchor', anchor: { model: opts.anchor?.model ?? [0, 0], turn: opts.anchor?.turn ?? 0, city: p } }); setPicking(false) }} />}
                    {built && <ChecksList checks={built.model.checks} />}
                    {built && built.towers.length > 1 && (
                      <div role="tablist" aria-label="Towers found" className="flex flex-wrap gap-1">
                        {built.towers.map((t, n) => <button key={t.key} role="tab" aria-selected={one === t} onClick={() => setShown(n)} className={`rounded-md border px-2 py-1 text-[11px] ${one === t ? 'border-accent bg-accent/10 font-semibold text-accent' : 'border-line hover:border-accent'}`}>{t.tower.name}</button>)}
                      </div>
                    )}
                    {one && <PreviewBlock storeys={one.tower.imported!.storeys} top={one.tower.imported!.top} volume={one.tower.imported!.volume} hull={built!.placed!.local} rotation={built!.placed!.rotation} northDeg={frame.northDeg} fileNorth={built!.placed!.fileNorthDeg} />}
                    {one && <HealthList items={one.health} />}
                    {built && built.model.ignored.length > 0 && (
                      <details className="rounded-md border border-line bg-panel p-2 text-[11px]">
                        <summary className="cursor-pointer text-muted hover:text-ink">{built.model.ignored.length} item{built.model.ignored.length === 1 ? '' : 's'} left out, and why</summary>
                        <ul className="mt-1 grid max-h-40 gap-1 overflow-y-auto">{built.model.ignored.map((s, i) => <li key={i}><b>{s.name}</b> <span className="text-muted">({s.kind}{s.layer ? `, ${s.layer}` : ''})</span>: {s.reason}</li>)}</ul>
                      </details>
                    )}
                    {raw.notes.length > 0 && <div className="rounded-md border border-line bg-panel p-2 text-[11px] text-muted">{raw.notes.map((n, i) => <p key={i}>{n}</p>)}</div>}
                  </div>
                </div>
              )}
            </>
          )}
          {raw && error && <div className="p-5"><ErrorBox text={error} /></div>}
        </div>

        {raw && opts && mapping && (
          <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">
            <div className="mr-auto flex items-center gap-1.5 text-[11px] text-muted">
              {step === 'map' ? <><Lock size={12} aria-hidden />Read in this browser; nothing is uploaded to a server.</>
                : needsUnit ? <span className="font-medium text-[#8a5a00]">Confirm the units first (the file does not say).</span>
                : blocked ? <span className="font-medium text-red-700">{built?.blocked}</span>
                : !built ? <span>Checking…</span>
                : opts.north === 'unresolved' ? <span className="inline-flex items-center gap-1"><FlagChip flag="unresolved" />North stays unresolved: sun and wind results will say so.</span>
                : <span>{built.towers.length} tower{built.towers.length === 1 ? '' : 's'}, {built.towers.reduce((s, t) => s + t.tower.imported!.storeys.filter((x) => x.hasFloor).length, 0)} storeys ready.</span>}
            </div>
            <button onClick={close} className="rounded-md border border-line px-3 py-1.5 text-xs hover:border-accent">Cancel</button>
            {step === 'map' ? (
              <button data-autofocus disabled={!massObjects.length} title={massObjects.length ? undefined : 'Map at least one layer with volumes to Tower massing, Podium or Program'}
                onClick={() => { setMapping({ ...mapping, confirmed: Object.keys(mapping.rules) }); setOpts(defaultOptions(raw, mapping, frame, sel?.f2f ?? 4.2)); setShown(0); setStep('check') }}
                className="flex items-center gap-1 rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40">Check units, north and datum<ArrowRight size={13} /></button>
            ) : (
              <>
                <button onClick={() => setStep('map')} className="flex items-center gap-1 rounded-md border border-line px-3 py-1.5 text-xs hover:border-accent"><ArrowLeft size={13} />Mapping</button>
                {replaceId && built?.towers.length === 1 && <button disabled={blocked || needsUnit} onClick={() => use('replace-one')} className="rounded-md border border-accent px-3 py-1.5 text-xs text-accent hover:bg-accent/10 disabled:opacity-40">Replace {towers.find((t) => t.id === replaceId)?.name ?? 'the tower'}</button>}
                <button disabled={blocked || needsUnit || !built} onClick={() => use('add')} className="rounded-md border border-accent px-3 py-1.5 text-xs text-accent hover:bg-accent/10 disabled:opacity-40">Add to the {project === 'vtc' ? 'competition site' : 'Real Vancouver'} towers</button>
                {prior && priorTowers > 0 ? (
                  <>
                    <button disabled={blocked || needsUnit || !built} onClick={() => use('replace-all')} className="rounded-md border border-accent px-3 py-1.5 text-xs text-accent hover:bg-accent/10 disabled:opacity-40">Replace all {towers.length} towers</button>
                    <button disabled={blocked || needsUnit || !built} onClick={() => use('update')} data-autofocus title="A new version of the uploaded model: its towers are replaced, keeping their names and the storey uses you set by hand; your other towers stay" className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40">Update {prior.source.fileName} ({priorTowers} tower{priorTowers === 1 ? '' : 's'})</button>
                  </>
                ) : (
                  <button disabled={blocked || needsUnit || !built} onClick={() => use('replace-all')} data-autofocus className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40">Use this model (replaces the {towers.length} tower{towers.length === 1 ? '' : 's'})</button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>,
    host,
  )
}

// ---------- pieces ----------

function Steps({ step }: { step: 'map' | 'check' }) {
  const s = (n: number, label: string, on: boolean) => <li className={`flex items-center gap-1.5 ${on ? 'font-semibold text-accent' : 'text-muted'}`} aria-current={on ? 'step' : undefined}><span className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${on ? 'bg-accent text-white' : 'border border-line'}`}>{n}</span>{label}</li>
  return <ol className="ml-auto hidden items-center gap-3 self-center text-[11px] md:flex" aria-label="Steps">{s(1, 'Map layers to roles', step === 'map')}{s(2, 'Check and use', step === 'check')}</ol>
}

function DropZone({ loading, file, onFile, inputRef, onCancel, onLink }: { loading: { phase: string; done: number; total: number } | null; file: { name: string; size: number } | null; onFile: (f: File) => void; inputRef: RefObject<HTMLInputElement | null>; onCancel: () => void; onLink?: () => void }) {
  const [over, setOver] = useState(false)
  const pct = loading && loading.total > 1 ? Math.round((loading.done / loading.total) * 100) : null
  return (
    <div onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f) onFile(f) }}
      className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center ${over ? 'border-accent bg-accent/5' : 'border-line'}`}>
      {loading ? (
        <>
          <Loader2 size={22} className="animate-spin text-accent" aria-hidden />
          <span className="text-sm" role="status">{file?.name}: {loading.phase.toLowerCase()}{pct != null ? ` (${loading.done.toLocaleString('en-CA')} of ${loading.total.toLocaleString('en-CA')} objects)` : '…'}</span>
          {pct != null && <div className="h-1.5 w-64 overflow-hidden rounded-full bg-black/10" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Reading the file"><div className="h-full bg-accent" style={{ width: `${pct}%` }} /></div>}
          <span className="text-[11px] text-muted">{file && file.size > LARGE_BYTES ? `A large file (${(file.size / 1048576).toFixed(0)} MB): reading may take a minute; the page stays usable. ` : ''}Rhino and IFC files load a WebAssembly reader the first time (about 3 MB and 5 MB, then cached). It all runs on this device.</span>
          <button onClick={onCancel} className="rounded-md border border-line px-3 py-1 text-xs hover:border-accent">Cancel</button>
        </>
      ) : (
        <>
          <Upload size={22} className="text-accent" aria-hidden />
          <span className="text-sm font-medium">Drop a Rhino model here, or</span>
          <span className="flex flex-wrap items-center justify-center gap-2">
            <button data-autofocus onClick={() => inputRef.current?.click()} className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white">Choose a file</button>
            {onLink && <button onClick={onLink} title="The model then updates by itself each time you save the file in Rhino, while this tab is open (Chrome and Edge)" className="rounded-md border border-accent px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/10">Link a file: update on each save</button>}
          </span>
          <span className="text-[11px] text-muted">.3dm · .obj · .glb / .gltf · .ifc</span>
          <span className="flex items-center gap-1 text-[11px] text-muted"><Lock size={11} aria-hidden />Read in this browser; nothing is uploaded to a server.</span>
        </>
      )}
      <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }} />
    </div>
  )
}

const SEVERITY_ICON = { info: <CircleCheck size={13} className="mt-0.5 shrink-0 text-emerald-700" aria-label="OK" />, warn: <CircleAlert size={13} className="mt-0.5 shrink-0 text-[#8a5a00]" aria-label="Check" />, block: <TriangleAlert size={13} className="mt-0.5 shrink-0 text-red-700" aria-label="Blocks the upload" /> }

/** The model in plain words: units, north, datum, towers, program, core, site, context, health, what is left out. */
function ChecksList({ checks }: { checks: ModelCheck[] }) {
  const order = { block: 0, warn: 1, info: 2 }
  return (
    <section className="rounded-lg border border-line bg-panel p-3">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold"><Info size={13} className="text-accent" />In plain words</div>
      <ul className="grid gap-1.5">
        {[...checks].sort((a, b) => order[a.severity] - order[b.severity]).map((c) => (
          <li key={c.id} className="flex items-start gap-1.5 text-[11.5px] leading-snug">{SEVERITY_ICON[c.severity]}<span className="min-w-0 flex-1">{c.text}</span>{c.flag && <FlagChip flag={c.flag} />}</li>
        ))}
      </ul>
    </section>
  )
}

function ProjectBlock({ project, onPick }: { project: 'vtc' | 'city'; onPick: (p: 'vtc' | 'city') => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-panel px-3 py-2 text-xs">
      <span className="font-semibold">Place it in</span>
      {(['vtc', 'city'] as const).map((p) => <button key={p} onClick={() => onPick(p)} aria-pressed={project === p} className={`rounded border px-2 py-0.5 text-[11px] ${project === p ? 'border-accent bg-accent/10 font-semibold text-accent' : 'border-line hover:border-accent'}`}>{p === 'vtc' ? 'Competition site' : 'Real Vancouver'}</button>)}
      <span className="text-[10px] text-muted">north, datum and placement follow the project</span>
    </div>
  )
}

function FormatsTable() {
  return (
    <div>
      <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted">Supported formats (22 Oct 2026) <FlagChip flag="team_assumption" /></div>
      <table className="w-full text-left text-[11px]">
        <thead className="text-muted"><tr><th className="py-1 pr-2 font-medium">File</th><th className="pr-2 font-medium">How to get it</th><th className="pr-2 font-medium">Keeps</th><th className="font-medium">Loses</th></tr></thead>
        <tbody>{FORMATS.map((f) => <tr key={f.ext} className="border-t border-line align-top"><td className="py-1 pr-2 font-mono">{f.ext}</td><td className="pr-2">{f.route}</td><td className="pr-2 text-muted">{f.keeps}</td><td className="text-muted">{f.loses}</td></tr>)}</tbody>
      </table>
      <p className="mt-1 text-[10px] text-muted">Routes from research P14-M02 (rhino3dm, web-ifc and three.js readers; SketchUp and Revit need an export first).</p>
    </div>
  )
}

function ErrorBox({ text }: { text: string }) {
  return <div role="alert" className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-2.5 text-xs text-red-800"><TriangleAlert size={14} className="mt-0.5 shrink-0" /><span>{text}</span></div>
}

function Block({ icon, title, right, children }: { icon: ReactNode; title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-panel p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold">{icon}{title}<span className="ml-auto">{right}</span></div>
      {children}
    </section>
  )
}

function Radio<T extends string>({ name, value, current, onPick, children }: { name: string; value: T; current: T; onPick: (v: T) => void; children: ReactNode }) {
  return (
    <label className={`flex cursor-pointer items-start gap-2 rounded px-1.5 py-1 text-xs ${current === value ? 'bg-accent/10' : 'hover:bg-black/[0.03]'}`}>
      <input type="radio" name={name} checked={current === value} onChange={() => onPick(value)} className="mt-0.5 accent-accent" />
      <span className="min-w-0 flex-1">{children}</span>
    </label>
  )
}

function FileSummary({ raw, size, onOther, linked }: { raw: LoadedImport; size: number | null; onOther: () => void; linked?: boolean }) {
  const curves = raw.curves?.length ?? 0
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line bg-black/[0.03] px-5 py-2 text-xs">
      <FileUp size={14} className="text-accent" aria-hidden />
      <span className="truncate font-medium">{raw.fileName}</span>
      {linked && <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent">linked: updates on each save</span>}
      <span className="text-muted">{FORMAT_LABEL[raw.format]}{size != null ? ` · ${size >= 1048576 ? `${(size / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`}` : ''} · {raw.objects.length} volume{raw.objects.length === 1 ? '' : 's'}{curves ? ` · ${curves} curve${curves === 1 ? '' : 's'}` : ''} · {raw.objects.reduce((s, o) => s + o.mesh.indices.length / 3, 0).toLocaleString('en-CA')} triangles{raw.skipped.length ? ` · ${raw.skipped.length} unreadable` : ''}</span>
      <span className="flex items-center gap-1 text-[11px] text-muted"><Lock size={11} aria-hidden />stays in this browser</span>
      <button onClick={onOther} className="ml-auto shrink-0 text-[11px] text-accent hover:underline">Other file</button>
    </div>
  )
}

function UnitsBlock({ raw, objects, opts, up }: { raw: LoadedImport; objects: { mesh: MeshData }[]; opts: ImportOptions; up: (p: Partial<ImportOptions>) => void }) {
  // Extent of the massing (tower, podium and program rows), so context far away does not skew the unit guess.
  const all = useMemo(() => bounds(mergeMeshes((objects.length ? objects : raw.objects).map((o) => o.mesh))), [raw, objects])
  const yUp = opts.upAxis === 'y'
  const ext = { height: yUp ? all.max[1] - all.min[1] : all.max[2] - all.min[2], width: all.max[0] - all.min[0], depth: yUp ? all.max[2] - all.min[2] : all.max[1] - all.min[1] }
  const cands = unitCandidates(ext)
  const fromFile = raw.unit != null && raw.unit === opts.unit
  return (
    <Block icon={<Ruler size={14} className="text-accent" />} title="Units and up axis"
      right={fromFile ? <span className="flex items-center gap-1 text-[10px] font-normal text-muted">From the file</span> : opts.unitConfirmed ? <FlagChip flag="team_assumption" /> : <FlagChip flag="unresolved" />}>
      <p className="mb-1.5 text-[11px] text-muted">{raw.unitNote}.</p>
      <div className="grid grid-cols-5 gap-1">
        {cands.map((c) => (
          <button key={c.unit} onClick={() => up({ unit: c.unit, unitConfirmed: true })} aria-pressed={opts.unit === c.unit}
            className={`rounded-md border px-1 py-1 text-center text-[11px] ${opts.unit === c.unit ? 'border-accent bg-accent/10 font-semibold text-accent' : 'border-line hover:border-accent'}`}>
            <div>{c.unit}</div>
            <div className={`text-[10px] tabular-nums ${c.fitsBrief ? 'text-emerald-700' : c.plausible ? 'text-muted' : 'text-red-700'}`}>{fmtLen(c.height)}</div>
          </button>
        ))}
      </div>
      <p className="mt-1 text-[10px] text-muted">Tower height under each unit; green fits the 244-305 m brief range (unverified), red is not a tower.</p>
      {!fromFile && !opts.unitConfirmed && (
        <button onClick={() => up({ unitConfirmed: true })} className="mt-1.5 rounded-md bg-[#8a5a00] px-2 py-1 text-[11px] font-semibold text-white">Confirm {UNIT_LABEL[opts.unit]} ({fmtLen(ext.height * UNIT_SCALE[opts.unit])} tall)</button>
      )}
      {raw.format === 'obj' && (
        <div className="mt-2 flex items-center gap-2 text-xs">
          <span className="text-muted">Up axis</span>
          {(['z', 'y'] as const).map((a) => (
            <button key={a} onClick={() => up({ upAxis: a })} aria-pressed={opts.upAxis === a} className={`rounded border px-2 py-0.5 text-[11px] ${opts.upAxis === a ? 'border-accent bg-accent/10 text-accent' : 'border-line'}`}>{a.toUpperCase()} up</button>
          ))}
          <span className="text-[10px] text-muted">{raw.upNote}; guessed from the tall axis.</span>
        </div>
      )}
    </Block>
  )
}

function PlaceBlock({ opts, up, frame, rawCentre, minZ, earth, centre }: { opts: ImportOptions; up: (p: Partial<ImportOptions>) => void; frame: ProjectFrame; rawCentre: [number, number]; minZ: number; earth: boolean; centre: [number, number] }) {
  return (
    <Block icon={<ScanLine size={14} className="text-accent" />} title="Placement and zero level">
      <div className="grid gap-0.5">
        <Radio name="place" value="keep" current={opts.placement} onPick={(v: Placement) => up({ placement: v })}>Keep the file's coordinates <span className="text-muted">(the file origin is this project's origin; centre at {fmtLen(rawCentre[0])}, {fmtLen(rawCentre[1])})</span></Radio>
        <Radio name="place" value="centre" current={opts.placement} onPick={(v: Placement) => up({ placement: v })}>Centre on the {frame.project === 'vtc' ? 'VTC site' : 'study site (selected tower)'}</Radio>
        {frame.utmOrigin && <Radio name="place" value="utm" current={opts.placement} onPick={(v: Placement) => up({ placement: v })}>File uses UTM 10N map coordinates <span className="text-muted">(EPSG:26910; subtract the project origin)</span></Radio>}
        {earth && <Radio name="place" value="earth" current={opts.placement} onPick={(v: Placement) => up({ placement: v, anchor: opts.anchor ?? { model: centre, city: frame.siteCentre, turn: 0 } })}>Use the file's Earth anchor <span className="text-muted">(its latitude and longitude put the base point on the map)</span></Radio>}
        <Radio name="place" value="anchor" current={opts.placement} onPick={(v: Placement) => up({ placement: v, anchor: opts.anchor ?? { model: centre, city: frame.siteCentre, turn: 0 } })}>Anchor a point of the model on the {frame.utmOrigin ? 'map' : 'site'}, plus a turn</Radio>
        <Radio name="place" value="custom" current={opts.placement} onPick={(v: Placement) => up({ placement: v })}>
          Move by an offset
          {opts.placement === 'custom' && (
            <span className="mt-1 flex gap-2">
              {(['x', 'y'] as const).map((k, i) => (
                <label key={k} className="flex items-center gap-1 text-[11px] text-muted">d{k}
                  <input type="number" value={opts.offset[i]} onChange={(e) => up({ offset: (i === 0 ? [Number(e.target.value), opts.offset[1]] : [opts.offset[0], Number(e.target.value)]) as [number, number] })} className="w-20 rounded border border-line px-1 py-0.5 text-right tabular-nums text-ink" />m
                </label>
              ))}
            </span>
          )}
        </Radio>
      </div>
      <div className="mt-2 border-t border-line pt-2">
        <div className="mb-1 text-[11px] text-muted">Zero level: the lowest point is at {minZ.toFixed(2)} m in the file.</div>
        {(['zero', 'lowest', 'geodetic', 'custom'] as DatumMode[]).map((d) => (
          <Radio key={d} name="datum" value={d} current={opts.datum} onPick={(v: DatumMode) => up({ datum: v })}>
            {DATUM_LABEL[d]}{d === 'geodetic' && <span className="text-muted"> (subtracts the project ground, {frame.groundElevation} m)</span>}
            {d === 'custom' && opts.datum === 'custom' && <input type="number" value={opts.dz} onChange={(e) => up({ dz: Number(e.target.value) })} className="ml-2 w-20 rounded border border-line px-1 py-0.5 text-right tabular-nums" aria-label="Height to subtract" />}
          </Radio>
        ))}
        <p className="mt-1 text-[10px] text-muted">Storeys count up from the entrance floor (CTBUH counts from the lowest significant open-air entrance).</p>
      </div>
    </Block>
  )
}

function NorthBlock({ raw, opts, up, frame, rotation }: { raw: LoadedImport; opts: ImportOptions; up: (p: Partial<ImportOptions>) => void; frame: ProjectFrame; rotation: number }) {
  const modes: NorthMode[] = [...(raw.fileNorthDeg != null ? ['file' as const] : []), 'base', 'true', 'street', 'magnetic', 'custom', 'unresolved']
  return (
    <Block icon={<Compass size={14} className="text-accent" />} title="Which way is north in this file?"
      right={opts.north === 'unresolved' ? <FlagChip flag="unresolved" /> : opts.north === 'file' || opts.north === 'street' || opts.north === 'magnetic' ? <FlagChip flag="unverified" /> : <FlagChip flag="team_assumption" />}>
      <p className="mb-1.5 text-[11px] text-muted">{raw.northNote}. Sun, shadow and view results turn with this angle; it is never assumed.</p>
      <div className="grid gap-0.5">
        {modes.map((m) => (
          <Radio key={m} name="north" value={m} current={opts.north} onPick={(v: NorthMode) => up({ north: v })}>
            {NORTH_LABEL[m]}
            <span className="text-muted">
              {m === 'file' && ` (${raw.fileNorthDeg}° from +Y)`}
              {m === 'base' && ` (true north ${frame.northDeg}° clockwise from +Y${frame.project === 'vtc' ? ', the VTC base model' : ', UTM grid'})`}
              {m === 'street' && ` (${STREET_GRID_NORTH}°, derived from City parcel edges, one 700 m sample)`}
              {m === 'magnetic' && ` (true north ${MAGNETIC_DECLINATION}° counter-clockwise: declination east, WMM2025 for Oct 2026, unverified)`}
            </span>
            {m === 'custom' && opts.north === 'custom' && (
              <span className="mt-1 flex items-center gap-1 text-[11px] text-muted">True north is
                <input type="number" value={opts.northDeg} step={0.5} onChange={(e) => up({ northDeg: Number(e.target.value) })} className="w-16 rounded border border-line px-1 py-0.5 text-right tabular-nums text-ink" aria-label="North angle" />
                ° clockwise from the file's +Y
              </span>
            )}
          </Radio>
        ))}
      </div>
      {opts.north !== 'unresolved' && <p className="mt-1.5 text-[11px]">The model turns <b>{Math.abs(rotation).toFixed(1)}° {rotation >= 0 ? 'counter-clockwise' : 'clockwise'}</b> to line its north up with the project's.</p>}
      <p className="mt-1 text-[10px] text-muted">Research P14-M03: true, magnetic (about 15.4° east here), UTM grid (about 0.09°) and street-grid north (about 44.7°) differ. A site plan's arrow does not say which it is: check.</p>
    </Block>
  )
}

function StoreyBlock({ opts, up, detected, defaultF2F }: { opts: ImportOptions; up: (p: Partial<ImportOptions>) => void; detected: number; defaultF2F: number }) {
  return (
    <Block icon={<Layers size={14} className="text-accent" />} title="Storeys" right={<FlagChip flag="team_assumption" />}>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <label className="grid gap-1"><span className="text-muted">Floor-to-floor</span>
          <span className="flex items-center gap-1"><input type="number" step={0.1} min={2.5} value={opts.f2f} onChange={(e) => up({ f2f: Math.max(2.5, Number(e.target.value)) })} className="w-16 rounded border border-line px-1 py-0.5 text-right tabular-nums" />m</span>
        </label>
        <label className="grid gap-1"><span className="text-muted">Podium top {opts.podiumTop == null ? '(found)' : ''}</span>
          <span className="flex items-center gap-1"><input type="number" step={0.5} min={0} value={opts.podiumTop ?? detected} onChange={(e) => up({ podiumTop: Math.max(0, Number(e.target.value)) })} className="w-16 rounded border border-line px-1 py-0.5 text-right tabular-nums" />m</span>
        </label>
        <label className="grid gap-1"><span className="text-muted">Podium storeys</span>
          <span className="flex items-center gap-1"><input type="number" step={0.1} min={2.5} value={opts.podiumF2F} onChange={(e) => up({ podiumF2F: Math.max(2.5, Number(e.target.value)) })} className="w-16 rounded border border-line px-1 py-0.5 text-right tabular-nums" />m</span>
        </label>
      </div>
      <p className="mt-1.5 text-[10px] text-muted">
        Default floor-to-floor {defaultF2F} m from the selected tower. The podium is found where the plate shrinks by 30% or more (heuristic){opts.podiumTop != null && <> · <button onClick={() => up({ podiumTop: null })} className="text-accent hover:underline">find it again</button></>}.
        Each storey is cut at mid-height (exact for straight walls, close for tapers). Program follows the selected tower's bands; change it per storey after import.
      </p>
    </Block>
  )
}

function PreviewBlock({ storeys, top, volume, hull, rotation, northDeg, fileNorth }: { storeys: ImportedStorey[]; top: number; volume: number | null; hull: { positions: ArrayLike<number> }; rotation: number; northDeg: number; fileNorth: number | null }) {
  const floored = storeys.filter((s) => s.hasFloor)
  const gfa = floored.reduce((a, s) => a + s.area, 0)
  const maxA = Math.max(1, ...storeys.map((s) => s.area))
  const sum = storeys.reduce((a, s) => a + s.area * (s.z1 - s.z0), 0)
  const err = volume ? (sum - volume) / volume : null
  const H = 230, W = 190
  const scale = H / Math.max(1, top)
  return (
    <section className="rounded-lg border border-line bg-panel p-3">
      <div className="mb-2 flex items-center text-xs font-semibold">Storeys and plates<span className="ml-auto text-[10px] font-normal text-muted">gross, mid-height cut</span></div>
      <div className="flex gap-3">
        <svg width={W} height={H + 4} role="img" aria-label="Storey plates by height, coloured by program">
          {storeys.map((s) => {
            const w = (s.area / maxA) * (W - 30)
            return (
              <rect key={s.level} x={30} y={H - s.z1 * scale + 2} width={Math.max(1, w)} height={Math.max(0.6, (s.z1 - s.z0) * scale - 0.4)}
                fill={s.hasFloor ? USES[s.use].color : '#e6e6e6'} stroke={s.hasFloor ? 'none' : '#999'} strokeDasharray="2 2">
                <title>{`L${s.level} · +${s.z0.toFixed(1)} m · ${Math.round(s.area).toLocaleString()} m²${s.hasFloor ? ` · ${USES[s.use].label}` : ' · no floor (too small or void)'}`}</title>
              </rect>
            )
          })}
          {[0, 0.5, 1].map((k) => <text key={k} x={0} y={H - k * top * scale + 6} fontSize={9} fill="#6b6f76">{Math.round(k * top)}</text>)}
        </svg>
        <div className="grid min-w-0 flex-1 content-start gap-2 text-[11px]">
          <Stat label="Height (entrance to top)" value={`${top.toFixed(1)} m`} />
          <Stat label="Storeys with floor" value={`${floored.length}${storeys.length > floored.length ? ` (+${storeys.length - floored.length} without)` : ''}`} />
          <Stat label="Gross floor area" value={`${Math.round(gfa).toLocaleString()} m²`} />
          <Stat label="Plate-sum check" value={err == null ? 'needs a closed mesh' : `${(Math.abs(err) < 5e-5 ? 0 : err * 100).toFixed(2)}% vs volume`} tone={err == null ? 'muted' : Math.abs(err) <= 0.005 ? 'good' : Math.abs(err) > 0.02 ? 'bad' : 'warn'} />
          <PlanNorth hull={hull} rotation={rotation} northDeg={northDeg} resolved={fileNorth != null} />
        </div>
      </div>
      <p className="mt-1 text-[10px] text-muted">Plate-sum check (P14-M04): plates × storey height against the mesh volume; ≤ 0.5% good, &gt; 2% poor (team presets).</p>
    </section>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'warn' | 'bad' | 'muted' }) {
  const c = tone === 'good' ? 'text-emerald-700' : tone === 'bad' ? 'text-red-700' : tone === 'warn' ? 'text-[#8a5a00]' : tone === 'muted' ? 'text-muted' : ''
  return <div><div className="text-muted">{label}</div><div className={`font-semibold tabular-nums ${c}`}>{value}</div></div>
}

/** Plan of the mass as it will sit in the project, with the project's true north. */
function PlanNorth({ hull, rotation, northDeg, resolved }: { hull: { positions: ArrayLike<number> }; rotation: number; northDeg: number; resolved: boolean }) {
  const pts = useMemo(() => {
    const p = hull.positions, a = (rotation * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a)
    const out: [number, number][] = []
    const step = Math.max(3, Math.floor(p.length / 3 / 2000) * 3)
    for (let i = 0; i < p.length; i += step) out.push([p[i] * c - p[i + 1] * s, p[i] * s + p[i + 1] * c])
    return out
  }, [hull, rotation])
  const R = Math.max(1, ...pts.map(([x, y]) => Math.hypot(x, y)))
  const k = 34 / R
  const hullPts = convex(pts).map(([x, y]) => `${x * k},${-y * k}`).join(' ')
  return (
    <div className="flex items-center gap-2">
      <svg width={80} height={80} viewBox="-40 -40 80 80" role="img" aria-label="Plan of the mass with true north">
        <circle r={38} fill="none" stroke="#e3e1dc" />
        <polygon points={hullPts} fill="#1f5f8b22" stroke="#1f5f8b" strokeWidth={1} />
        <g transform={`rotate(${northDeg})`}><path d="M0 -38 L4 -28 L0 -30 L-4 -28 Z" fill={resolved ? '#1f5f8b' : '#6e5800'} /><text y={-22} fontSize={8} textAnchor="middle" fill={resolved ? '#1f5f8b' : '#6e5800'}>N</text></g>
      </svg>
      <span className="text-[10px] text-muted">{resolved ? 'Plan as placed: model grid up, true north arrow.' : 'North unresolved: placed without turning.'}</span>
    </div>
  )
}

function convex(points: [number, number][]): [number, number][] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (pts.length < 3) return pts
  const cr = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lo: [number, number][] = [], hi: [number, number][] = []
  for (const p of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p) }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (hi.length >= 2 && cr(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p) }
  return [...lo.slice(0, -1), ...hi.slice(0, -1)]
}
