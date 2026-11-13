// The open design tool in the Properties tab (the workspace's toolPanel + snapPanel): its name and key, its options
// (Line: Freeform / Offset, width, which side; Boolean: Union / Subtract / Intersect), the live instructions, Done, then
// Snapping (grid on / off and size; for Line and Split the endpoint, midpoint, edge, alignment and direction snaps and
// the angle steps).
import { useEffect, useState, type ReactNode } from 'react'
import { setTool, toolDef, useDraw, type Snapping } from '../../lib/drawTools'

const section = 'border-b border-line px-3 py-3'
const h3 = 'mb-2 flex items-center gap-2 text-control font-semibold text-ink'

function Seg<T extends string>({ value, list, onChange }: { value: T; list: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div role="group" className="mb-2 flex rounded-lg bg-subtle p-0.5">
      {list.map(([v, w]) => (
        <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}
          className={`flex-1 rounded-md px-2 py-1 text-control outline-none focus-visible:ring-2 focus-visible:ring-accent ${value === v ? 'bg-panel font-medium text-ink shadow-sm' : 'text-muted hover:text-ink'}`}>{w}</button>
      ))}
    </div>
  )
}
function Switch({ on, label, onChange }: { on: boolean; label: string; onChange: (v: boolean) => void }) {
  return (
    <div className="flex min-h-8 items-center justify-between text-control text-ink">
      <span>{label}</span>
      <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
        className={`relative h-6 w-11 shrink-0 rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent ${on ? 'bg-accent' : 'bg-line'}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
      </button>
    </div>
  )
}
const Row = ({ label, children }: { label: string; children: ReactNode }) => <label className="flex min-h-8 items-center justify-between gap-2 text-control text-ink">{label}{children}</label>
const sel = 'h-8 w-28 rounded-lg border-0 bg-subtle px-2 text-control text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent'

export default function DrawToolPanel() {
  const { tool, line, bmode, sn, grid, hint } = useDraw()
  const t = toolDef(tool)
  const full = tool === 'line' || tool === 'split'
  const setSn = (patch: Partial<Snapping>) => useDraw.setState((s) => ({ sn: { ...s.sn, ...patch } }))
  const [w, setW] = useState(String(line.width))
  useEffect(() => setW(String(line.width)), [line.width])
  return (
    <div data-testid="draw-tool-panel">
      <div className={section}>
        <h3 className={h3}>{t?.label.split(':')[0] ?? 'Tool'}{t?.key && <span className="font-normal text-muted">key {t.key}</span>}</h3>
        {tool === 'line' && <>
          <Seg value={line.mode} list={[['free', 'Freeform'], ['offset', 'Offset']]} onChange={(mode) => useDraw.setState((s) => ({ line: { ...s.line, mode } }))} />
          {line.mode === 'offset' && <>
            <Row label="Width, m"><input type="number" step={0.5} min={1} value={w} onChange={(e) => { setW(e.target.value); const v = parseFloat(e.target.value); if (v >= 1) useDraw.setState((s) => ({ line: { ...s.line, width: v } })) }} className={`${sel} text-right`} /></Row>
            <span className="mb-1 block text-meta text-muted">The line sits at</span>
            <Seg value={line.align} list={[['c', 'Centre'], ['i', 'Internal'], ['e', 'External']]} onChange={(align) => useDraw.setState((s) => ({ line: { ...s.line, align } }))} />
          </>}
        </>}
        {tool === 'bool' && <Seg value={bmode} list={[['union', 'Union'], ['subtract', 'Subtract'], ['intersect', 'Intersect']]} onChange={(b) => useDraw.setState({ bmode: b })} />}
        <p className="mb-3 text-meta leading-relaxed text-muted" data-testid="draw-hint" dangerouslySetInnerHTML={{ __html: hint.replace(/ · /g, '<br>') }} />
        <button type="button" onClick={() => setTool('select')} className="flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-line bg-panel text-control text-ink outline-none hover:border-boundary focus-visible:ring-2 focus-visible:ring-accent">
          Done <kbd className="rounded border border-line px-1 font-sans text-meta text-muted">Esc</kbd>
        </button>
      </div>
      <div className={section}>
        <h3 className={h3}>Snapping</h3>
        <Switch label="Grid" on={grid} onChange={(v) => useDraw.setState({ grid: v })} />
        <Row label="Grid size"><select value={sn.gs} onChange={(e) => setSn({ gs: +e.target.value })} className={sel}>{[[0.25, '0.25 m'], [0.5, '0.5 m'], [1, '1 m'], [2, '2 m'], [5, '5 m']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Row>
        {full && <>
          <Switch label="Endpoints" on={sn.corner} onChange={(v) => setSn({ corner: v })} />
          <Switch label="Midpoints" on={sn.mid} onChange={(v) => setSn({ mid: v })} />
          <Switch label="On edges" on={sn.edge} onChange={(v) => setSn({ edge: v })} />
          <Switch label="In line with corners" on={sn.align} onChange={(v) => setSn({ align: v })} />
          <Switch label="Parallel and perpendicular" on={sn.dir} onChange={(v) => setSn({ dir: v })} />
          <Row label="Angle steps"><select value={sn.angle} onChange={(e) => setSn({ angle: +e.target.value })} className={sel}>{[[0, 'Off'], [5, '5°'], [15, '15°'], [30, '30°'], [45, '45°'], [90, '90°']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Row>
        </>}
        <p className="mt-2 text-meta text-muted">{full ? 'Each kind of snap has its own marker colour. Hold Alt to switch all snapping off for a moment; hold Shift to lock to 90°.' : 'The grid applies to drawing, moving and pulling.'}</p>
      </div>
    </div>
  )
}

/** The toast and the dimension box over the view (the workspace's #toast and #dimbox). */
export function DrawChrome() {
  const toast = useDraw((s) => s.toast)
  const dim = useDraw((s) => s.dim)
  const [shown, setShown] = useState<string | null>(null)
  useEffect(() => {
    if (!toast) return
    setShown(toast.text)
    const t = setTimeout(() => setShown(null), 3200)
    return () => clearTimeout(t)
  }, [toast])
  return (
    <>
      {dim && <div data-testid="draw-dim" className={`pointer-events-none absolute z-30 rounded-md px-2 py-0.5 text-control font-medium tabular-nums shadow ${dim.typing ? 'bg-accent text-white' : 'bg-panel text-ink'}`} style={{ left: dim.x, top: dim.y }}>{dim.text}</div>}
      {shown && <div role="status" data-testid="draw-toast" className="pointer-events-none absolute bottom-14 left-1/2 z-30 -translate-x-1/2 rounded-lg px-3 py-1.5 text-control text-white shadow-lg" style={{ background: '#26262b' }}>{shown}</div>}
    </>
  )
}
