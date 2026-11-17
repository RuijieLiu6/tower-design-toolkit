// The design tool rail (Sinnie, 12 Nov: "properly import the design tools from the tower design tool to design toolkit.
// exactly the same"): the Tower Workspace's rail, tool for tool, in its order, with its keys and its own icons: Select V
// | Line L, Rectangle R, Circle O, Erase E | Move M, Copy / array C, Rotate Q, Offset F | Push / pull P, Split X,
// Boolean J, Edit length, Core | Tape T | Place A (here: place a toolkit tower). The pointer logic is
// components/draw/DrawTools.tsx; the open tool's options and snapping are in the Properties tab (draw/ToolPanel.tsx).
import { setTool, TOOLS, useDraw } from '../lib/drawTools'
import { toggleMode, useTowerEdit } from '../lib/towerEdit'
import { useStore } from '../store'
import { useBlockEdit } from '../lib/blockEdit'

const Sep = () => <span aria-hidden className="my-1 h-px w-7 shrink-0 bg-line" />

export default function TowerRail() {
  const tool = useDraw((s) => s.tool)
  const selMode = useDraw((s) => s.selMode)
  // Select › Mass or Face (16 Nov, Sinnie: "select mass vs select face"); Face also sets the block editor to faces.
  const pickSel = (m: 'mass' | 'face') => {
    useDraw.setState({ selMode: m })
    if (m === 'face') useBlockEdit.setState({ mode: 'face' })
    if (tool !== 'select') pick('select')
  }
  const present = useStore((s) => s.phase === 'present')
  const pick = (id: Parameters<typeof setTool>[0]) => {
    // The toolkit's own move / rotate gizmo steps aside for the workspace tools.
    const e = useTowerEdit.getState()
    if (e.picked && e.move) toggleMode('move')
    if (e.picked && e.rotate) toggleMode('rotate')
    useStore.getState().set({ placing: false })
    setTool(id)
  }
  return (
    <nav aria-label="Design tools" data-testid="tower-rail" className="glass-edge flex w-12 shrink-0 flex-col items-center gap-1 overflow-y-auto rounded-2xl bg-panel py-2" style={{ scrollbarWidth: 'none' }}>
      {TOOLS.map((t, i) => (t ? (
        <button key={t.id} type="button" data-tool={t.id} onClick={() => pick(t.id)} disabled={present && t.id !== 'select'}
          aria-label={t.label} aria-pressed={tool === t.id} aria-keyshortcuts={t.key || undefined} title={t.label + (t.key ? ` (${t.key})` : '')}
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-35 ${tool === t.id ? 'bg-ink text-white' : 'text-ink hover:bg-subtle'}`}>
          <svg width={18} height={18} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={t.d} /></svg>
        </button>
      ) : <Sep key={`s${i}`} />)).flatMap((el, i) => (i === 0 && tool === 'select' && !present ? [el, (
        // Select picks a whole mass (drag moves it) or one face (drag pushes / pulls it).
        <div key="selmode" role="radiogroup" aria-label="Select" data-testid="select-mode" className="flex flex-col gap-0.5 rounded-lg bg-subtle p-0.5">
          {([['mass', 'Select mass: drag a mass to move it', 'M4 7l6-3 6 3v7l-6 3-6-3zM4 7l6 3 6-3M10 10v7'], ['face', 'Select face: drag a face to push or pull it', 'M4 7l6-3 6 3v7l-6 3-6-3zM10 10l6-3v7l-6 3z']] as const).map(([m, label, d]) => (
            <button key={m} type="button" role="radio" aria-checked={selMode === m} data-selmode={m} aria-label={label} title={label} onClick={() => pickSel(m)}
              className={`flex h-7 w-7 items-center justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-accent ${selMode === m ? 'bg-panel text-accent shadow-sm' : 'text-muted hover:text-ink'}`}>
              <svg width={15} height={15} viewBox="0 0 20 20" fill={m === 'face' ? 'none' : 'none'} stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" aria-hidden><path d={d} />{m === 'face' && <path d="M10 10l6-3v7l-6 3z" fill="currentColor" fillOpacity={0.35} stroke="none" />}{m === 'mass' && <path d="M4 7l6-3 6 3v7l-6 3-6-3z" fill="currentColor" fillOpacity={0.25} stroke="none" />}</svg>
            </button>
          ))}
        </div>
      )] : [el]))}
    </nav>
  )
}
