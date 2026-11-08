// Component ribbon, Grasshopper style: one tab per category, icon tiles grouped into panels (two rows of icons,
// or labelled tiles with "Names" on). Drag a tile onto the canvas, or press Enter / click to drop it in the view.
import { FlaskConical, Hammer, Search, Type, Upload, Users, Wand2 } from '../icons'
import { useMemo, useState, type DragEvent } from 'react'
import type { NodeDef } from '../../data/registry'
import GlassIcon, { hueFor, ICON, monogram, nodeHue } from '../GlassIcon'
import { NodeTile } from '../NodeTile'
import { hasNodeArt } from '../icons/nodeArt'
import { catalog, STATUS_LABEL, TABS, type Entry, type TabId } from './catalog'

export const DRAG_MIME = 'application/x-tower-studio-node'
const NAMES_KEY = 'ts.ribbon.names'
const readNames = () => { try { return window.localStorage.getItem(NAMES_KEY) === '1' } catch { return false } }
const NO_BAR = { scrollbarWidth: 'thin' as const }

function Tile({ e, onAdd, names, onHover }: { e: Entry; onAdd: (e: Entry) => void; names: boolean; onHover: (e: Entry | null) => void }) {
  const Icon = e.icon
  const researched = e.status === 'researched'
  const onDragStart = (ev: DragEvent) => { ev.dataTransfer.setData(DRAG_MIME, e.ref); ev.dataTransfer.effectAllowed = 'copy' }
  // The same depth tile as the rest of the toolkit (GlassIcon): a built node lit in its own hue, a researched one as
  // clear glass with a flask, so what runs stands out by opacity.
  const glyph = (
    <span className="relative flex shrink-0">
      {!researched && hasNodeArt(e.ref) ? <NodeTile id={e.ref} size={ICON.tool} />
        : <GlassIcon icon={researched ? undefined : Icon} mono={researched ? monogram(e.name) : undefined} hue={e.category ? nodeHue(e.ref, e.category) : hueFor(e.name)} size={ICON.tool} level={researched ? 'off' : 'on'} />}
      {researched && <FlaskConical size={11} className="absolute -bottom-0.5 -right-0.5 rounded-full bg-white/90 p-px text-slate-600" aria-hidden />}
    </span>
  )
  return (
    <button draggable onDragStart={onDragStart} onClick={() => onAdd(e)} onMouseEnter={() => onHover(e)} onMouseLeave={() => onHover(null)} onFocus={() => onHover(e)} onBlur={() => onHover(null)}
      title={`${e.name} · ${STATUS_LABEL[e.status]}`} aria-label={`Add ${e.name} (${STATUS_LABEL[e.status]})`}
      className={`gicon-lift flex shrink-0 cursor-grab items-center rounded-xl outline-none hover:bg-white/40 focus-visible:ring-2 focus-visible:ring-accent active:cursor-grabbing ${names ? 'w-[76px] flex-col gap-1 px-1 py-1 text-center' : 'p-0.5'}`}>
      {glyph}
      {names && <span className={`line-clamp-2 text-meta leading-tight ${researched ? 'text-muted' : 'text-ink'}`}>{e.name}</span>}
    </button>
  )
}

function Panel({ title, entries, onAdd, names, onHover }: { title: string; entries: Entry[]; onAdd: (e: Entry) => void; names: boolean; onHover: (e: Entry | null) => void }) {
  if (!entries.length) return null
  return (
    <div className="flex shrink-0 flex-col border-r border-line">
      <div className={`flex-1 px-1.5 pt-1 ${names ? 'flex items-start gap-0.5' : 'grid grid-flow-col grid-rows-2 content-start justify-start gap-0.5'}`}>
        {entries.map((e) => <Tile key={e.ref} e={e} onAdd={onAdd} names={names} onHover={onHover} />)}
      </div>
      <div className="flex items-center justify-center gap-1 whitespace-nowrap border-t border-line/70 px-2 py-0.5 text-[9.5px] text-muted">
        {title.startsWith('Researched') && <FlaskConical size={10} aria-hidden />}{title} · {entries.length}
      </div>
    </div>
  )
}

export default function Ribbon({ tab, setTab, onAdd, onSearch, community, onNodeBuilder, onBrowse }: {
  tab: TabId; setTab: (t: TabId) => void; onAdd: (e: Entry) => void; onSearch: () => void; community: NodeDef[]; onNodeBuilder: (tab: 'build' | 'make' | 'import') => void; onBrowse?: () => void
}) {
  const [names, setNames] = useState(readNames)
  const [hover, setHover] = useState<Entry | null>(null)
  const all = useMemo(() => catalog(community), [community])
  const counts = useMemo(() => {
    const c: Partial<Record<TabId, number>> = {}
    for (const e of all) c[e.tab] = (c[e.tab] ?? 0) + 1
    return c
  }, [all])
  const here = all.filter((e) => e.tab === tab)
  const byPriority = (p: string) => here.filter((e) => e.status === 'researched' && e.priority === p)
  const toggleNames = () => { const v = !names; setNames(v); try { window.localStorage.setItem(NAMES_KEY, v ? '1' : '0') } catch { /* private mode */ } }
  const tabDef = TABS.find((t) => t.id === tab)!
  const panel = { onAdd, names, onHover: setHover }

  return (
    <div className="shrink-0 border-b border-line bg-chrome">
      <div className="flex items-end gap-2 px-2 pt-1.5">
        <div role="tablist" aria-label="Node categories" className="flex min-w-0 flex-1 items-stretch gap-0.5 overflow-x-auto" style={NO_BAR}>
          {TABS.map((t) => {
            const Icon = t.icon
            const on = t.id === tab
            return (
              <button key={t.id} role="tab" aria-selected={on} aria-controls="ribbon-panel" onClick={() => setTab(t.id)} title={t.label}
                className={`flex shrink-0 items-center gap-1.5 rounded-t-md border border-b-0 px-2 py-1 text-meta outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${on ? 'border-line bg-paper font-semibold text-ink' : 'border-transparent text-muted hover:text-ink'}`}>
                <span className="flex h-4 w-4 items-center justify-center rounded-sm text-white" style={{ background: t.color }}><Icon size={10} aria-hidden /></span>
                {t.short}<span className="hidden font-mono text-meta opacity-60 2xl:inline">{counts[t.id] ?? 0}</span>
              </button>
            )
          })}
        </div>
        <div className="flex shrink-0 items-center gap-1 pb-1">
          <button onClick={toggleNames} aria-pressed={names} title={names ? 'Icons only (Grasshopper style)' : 'Show node names under the icons'}
            className={`flex items-center gap-1 rounded-md border px-1.5 py-1 text-meta outline-none focus-visible:ring-2 focus-visible:ring-accent ${names ? 'border-accent/50 bg-accent/10 text-accent' : 'border-line text-muted hover:text-ink'}`}>
            <Type size={12} aria-hidden /><span className="hidden lg:inline">Names</span>
          </button>
          <button onClick={onSearch} className="flex items-center gap-1.5 rounded-md border border-line bg-panel px-2 py-1 text-meta text-muted outline-none hover:border-accent hover:text-ink focus-visible:ring-2 focus-visible:ring-accent" title="Search all nodes (/ or double-click the canvas)">
            <Search size={12} aria-hidden /><span className="hidden lg:inline">Find a node</span><kbd className="rounded border border-line px-1 font-mono text-meta">/</kbd>
          </button>
        </div>
      </div>
      <div id="ribbon-panel" role="tabpanel" aria-label={tabDef.label} className={`flex overflow-x-auto bg-paper ${names ? 'h-[124px]' : 'h-[122px]'}`} style={NO_BAR}>
        {/* Tab caption, or the hovered node, like Grasshopper's status tip. */}
        <div className="flex w-44 shrink-0 flex-col justify-center gap-0.5 border-r border-line px-3">
          {hover ? (
            <>
              <span className="line-clamp-2 text-meta font-semibold leading-tight">{hover.name}</span>
              <span className="flex items-center gap-1 text-meta text-muted">{hover.status === 'researched' && <FlaskConical size={10} aria-hidden />}{STATUS_LABEL[hover.status]}</span>
              <span className="text-[9.5px] text-muted">Drag onto the canvas, or click</span>
            </>
          ) : (
            <>
              <span className="text-meta font-semibold leading-tight">{tabDef.label}</span>
              <span className="text-meta text-muted">{here.length} node{here.length === 1 ? '' : 's'} · drag or click to add</span>
            </>
          )}
        </div>
        {tab === 'MINE' ? (
          <>
            <Panel title="My nodes" entries={here} {...panel} />
            <div className="flex max-w-md flex-col justify-center gap-1.5 px-4 text-meta text-muted">
              {!here.length && <p>No imported nodes yet. A community node is a small JSON package (tower-studio-node@1) with formulas, thresholds and their sources.</p>}
              <div className="flex flex-wrap gap-1.5">
                <button onClick={() => onNodeBuilder('build')} title="Copy the node-builder skill to your AI, then paste the package it writes"
                  className="flex items-center gap-1.5 rounded-md border border-line bg-panel px-2 py-1 font-medium text-ink outline-none hover:border-accent focus-visible:ring-2 focus-visible:ring-accent">
                  <Hammer size={13} aria-hidden />Build a node
                </button>
                <button onClick={() => onNodeBuilder('make')} title="Make a node here with a form: a formula, a threshold and its source, no AI needed"
                  className="flex items-center gap-1.5 rounded-md border border-line bg-panel px-2 py-1 font-medium text-ink outline-none hover:border-accent focus-visible:ring-2 focus-visible:ring-accent">
                  <Wand2 size={13} aria-hidden />Make one here
                </button>
                <button onClick={() => onNodeBuilder('import')} title="Import a node package (.json) someone shared with you"
                  className="flex items-center gap-1.5 rounded-md border border-line bg-panel px-2 py-1 font-medium text-ink outline-none hover:border-accent focus-visible:ring-2 focus-visible:ring-accent">
                  <Upload size={13} aria-hidden />Import a package
                </button>
                {onBrowse && (
                  <button onClick={onBrowse} title="Browse the community registry and install a node"
                    className="flex items-center gap-1.5 rounded-md border border-line bg-panel px-2 py-1 font-medium text-ink outline-none hover:border-accent focus-visible:ring-2 focus-visible:ring-accent">
                    <Users size={13} aria-hidden />Browse the community
                  </button>
                )}
              </div>
            </div>
          </>
        ) : (
          <>
            {tab !== 'L0' && tab !== 'LOGIC' && !here.some((e) => e.status !== 'researched') && (
              <div className="flex w-36 shrink-0 items-center border-r border-line px-3 text-[10.5px] text-muted">No built node here yet: the researched ones are placeholders.</div>
            )}
            <Panel title={tab === 'L0' ? 'Sources' : tab === 'LOGIC' ? 'Logic' : 'Built'} entries={here.filter((e) => e.status !== 'researched')} {...panel} />
            <Panel title="Researched · core" entries={byPriority('core')} {...panel} />
            <Panel title="Researched · v1" entries={byPriority('v1')} {...panel} />
            <Panel title="Researched · roadmap" entries={byPriority('roadmap')} {...panel} />
          </>
        )}
      </div>
    </div>
  )
}
