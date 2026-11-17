// The Drawing tab of the right panel while a drawing tool is on (Sinnie Choi's Properties panel for her tools,
// rewritten in the Toolkit's style; design from her Toolkit build, artifact 1794900977-6d89, and
// github.com/xubynii/towerdesigntool): the tool's name and key, its modes (Line: freeform or an offset band; Boolean:
// union, subtract, intersect), what to do next, the value being typed, Done (Esc), and the snapping panel: Grid on /
// off and its size, and for Line and Split the endpoint, midpoint, edge, alignment and parallel / perpendicular snaps
// with the angle step. Alt suspends snapping while held; Shift locks 90°. Kept per browser (lib/draw/drawStore.ts).
import { Check } from '../icons'
import { DRAW_TOOLS, drawToolDef, endDrawTool, setSnap, useDraw, type SnapSettings } from '../../lib/draw/drawStore'
import Help from '../Help'
import { Section, Toggle } from '../ui'

const GRID: SnapSettings['gridSize'][] = [0.25, 0.5, 1, 2, 5]
const ANGLES: SnapSettings['angle'][] = [0, 5, 15, 30, 45, 90]
const chip = (on: boolean) => `rounded-md border px-2 py-0.5 text-meta outline-none focus-visible:ring-2 focus-visible:ring-accent ${on ? 'border-accent bg-selected text-accent-hover' : 'border-line bg-panel text-ink hover:border-accent'}`

export default function DrawPanel() {
  const tool = useDraw((s) => s.tool)
  const snap = useDraw((s) => s.snap)
  const lineMode = useDraw((s) => s.lineMode)
  const lineWidth = useDraw((s) => s.lineWidth)
  const lineAlign = useDraw((s) => s.lineAlign)
  const boolMode = useDraw((s) => s.boolMode)
  const typed = useDraw((s) => s.typed)
  const boolFirst = useDraw((s) => s.boolFirst)
  if (!tool) return null
  const def = drawToolDef(tool)
  const pointy = tool === 'line' || tool === 'split'
  return (
    <div data-testid="draw-panel" data-draw-tool={tool}>
      <Section title={def.label} right={def.key ? <kbd className="rounded border border-line px-1.5 py-0.5 font-sans text-meta text-muted">{def.key}</kbd> : undefined}
        help={<>{def.hint} Every edit is one undo step (Ctrl+Z). The keys of all the tools: {DRAW_TOOLS.filter((t) => t.key).map((t) => `${t.word} ${t.key}`).join(', ')}.</>}>
        <p className="text-meta text-muted">{def.hint}</p>
        {tool === 'line' && (
          <div className="mt-2 grid gap-1.5">
            <div role="radiogroup" aria-label="Line mode" className="flex gap-1">
              {(['free', 'offset'] as const).map((m) => <button key={m} type="button" role="radio" aria-checked={lineMode === m} onClick={() => useDraw.setState({ lineMode: m })} className={chip(lineMode === m)}>{m === 'free' ? 'Freeform' : 'Offset band'}</button>)}
            </div>
            {lineMode === 'offset' && (
              <div className="flex flex-wrap items-center gap-2 text-meta">
                <label className="flex items-center gap-1 text-muted">Width<input type="number" min={1} max={60} step={0.5} value={lineWidth} aria-label="Band width (m)" onChange={(e) => useDraw.setState({ lineWidth: Math.max(1, Number(e.target.value) || 1) })} className="w-16 rounded border border-line bg-panel px-1.5 py-0.5 text-ink" /> m</label>
                <div role="radiogroup" aria-label="Line position" className="flex gap-1">
                  {([['c', 'Centre'], ['i', 'Internal'], ['e', 'External']] as const).map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={lineAlign === k} onClick={() => useDraw.setState({ lineAlign: k })} className={chip(lineAlign === k)}>{l}</button>)}
                </div>
              </div>
            )}
          </div>
        )}
        {tool === 'bool' && (
          <div className="mt-2 grid gap-1">
            <div role="radiogroup" aria-label="Boolean" className="flex gap-1">
              {(['union', 'subtract', 'intersect'] as const).map((m) => <button key={m} type="button" role="radio" aria-checked={boolMode === m} data-bool={m} onClick={() => useDraw.setState({ boolMode: m })} className={chip(boolMode === m)}>{m[0].toUpperCase() + m.slice(1)}</button>)}
            </div>
            <p className="text-meta text-muted">{boolFirst ? 'First mass picked: now click the second.' : 'Click the first mass, then the second.'}</p>
          </div>
        )}
        {typed && <p className="mt-2 text-meta text-ink">Typed <b className="text-accent">{typed}</b> · Enter applies it, Backspace edits, Esc clears.</p>}
        <button type="button" onClick={endDrawTool} data-testid="draw-done" className="mt-2 flex h-7 items-center gap-1 rounded-lg border border-line bg-panel px-2.5 text-meta text-ink outline-none hover:border-accent focus-visible:ring-2 focus-visible:ring-accent"><Check size={12} aria-hidden />Done <kbd className="ml-1 rounded border border-line px-1 font-sans text-muted">Esc</kbd></button>
      </Section>
      <Section title="Snapping" help={<>Grid: points and distances round to the grid size. For Line and Split, points also snap to the corners, middles and edges of the masses and the site, line up with corners, and run parallel or perpendicular to an edge; the angle step rounds a free direction. Hold Alt to draw without snapping; hold Shift to lock 90°.</>}>
        <div className="grid gap-1.5" data-testid="snap-panel">
          <Toggle checked={snap.grid} onChange={() => setSnap({ grid: !snap.grid })} label="Grid" />
          <div className="flex items-center gap-1" role="radiogroup" aria-label="Grid size">
            <span className="mr-1 text-meta text-muted">Size</span>
            {GRID.map((g) => <button key={g} type="button" role="radio" aria-checked={snap.gridSize === g} onClick={() => setSnap({ gridSize: g })} className={chip(snap.gridSize === g)}>{g} m</button>)}
          </div>
          {pointy && (
            <>
              <Toggle checked={snap.corner} onChange={() => setSnap({ corner: !snap.corner })} label="Endpoints" />
              <Toggle checked={snap.mid} onChange={() => setSnap({ mid: !snap.mid })} label="Midpoints" />
              <Toggle checked={snap.edge} onChange={() => setSnap({ edge: !snap.edge })} label="On edges" />
              {tool === 'line' && <Toggle checked={snap.align} onChange={() => setSnap({ align: !snap.align })} label="In line with corners" />}
              {tool === 'line' && <Toggle checked={snap.dir} onChange={() => setSnap({ dir: !snap.dir })} label="Parallel and perpendicular" />}
              {tool === 'line' && (
                <div className="flex flex-wrap items-center gap-1" role="radiogroup" aria-label="Angle step">
                  <span className="mr-1 text-meta text-muted">Angle step</span>
                  {ANGLES.map((a) => <button key={a} type="button" role="radio" aria-checked={snap.angle === a} onClick={() => setSnap({ angle: a })} className={chip(snap.angle === a)}>{a === 0 ? 'Off' : `${a}°`}</button>)}
                </div>
              )}
            </>
          )}
          <p className="text-meta text-muted">Alt: no snapping while held · Shift: 90°</p>
        </div>
      </Section>
      <div className="px-4 py-2 text-meta text-muted"><Help label="Where these tools come from">After Sinnie Choi's Tower Workspace (github.com/xubynii/towerdesigntool) and her build of this Toolkit, rewritten in the Toolkit's code and style.</Help></div>
    </div>
  )
}
