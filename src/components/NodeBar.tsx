// Bottom bar of the guided app: every evaluation node as an icon-only switch. The name shows on hover and on keyboard
// focus; switching a node on also shows its results in the right panel. Search, workflow presets, My nodes and the
// roadmap live in the Library popover at the bar's left end.
import { Library, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { NODE_ICONS, communityIcons } from '../data/icons'
import { BUILT_NODES, CATEGORIES, type Category, type NodeDef } from '../data/registry'
import { useCommunityNodeDefs } from '../lib/communityStore'
import { useStore, type Phase } from '../store'
import NodeLibrary, { stageOf } from './NodeLibrary'

const CAT_ORDER = Object.keys(CATEGORIES) as Category[]
const byCategory = (a: NodeDef, b: NodeDef) => CAT_ORDER.indexOf(a.category) - CAT_ORDER.indexOf(b.category)
const STAGE_NAME: Record<string, string> = { basic: 'Massing', advanced: 'Schematic', present: 'Present' }

/** The bar's groups for a stage: the stage's own checks first; Schematic and Present keep the Massing checks too. */
function barGroups(phase: Phase): { label: string; nodes: NodeDef[] }[] {
  const of = (s: 'basic' | 'advanced') => BUILT_NODES.filter((n) => stageOf(n) === s).sort(byCategory)
  if (phase === 'basic') return [{ label: 'Massing checks', nodes: of('basic') }]
  if (phase === 'advanced') return [{ label: 'Schematic checks', nodes: of('advanced') }, { label: 'Carried from Massing', nodes: of('basic') }]
  return [{ label: 'Massing checks', nodes: of('basic') }, { label: 'Schematic checks', nodes: of('advanced') }]
}

const initials = (name: string) => name.split(/[^A-Za-z0-9]+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('')

type Tip = { n: NodeDef; x: number; y: number }

function LibraryPopover({ onClose, anchor }: { onClose: () => void; anchor: RefObject<HTMLButtonElement | null> }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.querySelector<HTMLInputElement>('input[aria-label="Search nodes"]')?.focus()
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (!ref.current?.contains(t) && !anchor.current?.contains(t)) onClose()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [onClose, anchor])
  return (
    <div ref={ref} id="node-library-pop" role="dialog" aria-label="Node library"
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); anchor.current?.focus() } }}
      className="absolute bottom-full left-2 z-40 mb-2 flex h-[min(70vh,34rem)] w-80 flex-col overflow-hidden rounded-lg border border-line bg-panel shadow-xl">
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <h2 className="text-xs font-semibold">Node library</h2>
        <button type="button" onClick={() => { onClose(); anchor.current?.focus() }} aria-label="Close the node library" className="rounded p-0.5 text-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"><X size={14} /></button>
      </div>
      <NodeLibrary />
    </div>
  )
}

export default function NodeBar() {
  const { phase, project, enabled, toggleNode, selectNode, selectedNode } = useStore(useShallow((s) => ({
    phase: s.phase, project: s.project, enabled: s.enabled, toggleNode: s.toggleNode, selectNode: s.selectNode, selectedNode: s.selectedNode,
  })))
  const community = useCommunityNodeDefs()
  const groups = useMemo(() => barGroups(phase), [phase])
  const cIcons = useMemo(() => communityIcons(community.map((c) => c.id)), [community])
  const all = useMemo(() => [...groups.flatMap((g) => g.nodes), ...community], [groups, community])
  const [tip, setTip] = useState<Tip | null>(null)
  const [active, setActive] = useState<string | null>(null)
  const [lib, setLib] = useState(false)
  const libButton = useRef<HTMLButtonElement>(null)
  const stop = active && all.some((n) => n.id === active) ? active : all[0]?.id
  const onCount = all.filter((n) => enabled[n.id]).length

  const showTip = (n: NodeDef, el: HTMLElement) => {
    const r = el.getBoundingClientRect()
    setTip({ n, x: Math.min(window.innerWidth - 130, Math.max(130, r.left + r.width / 2)), y: r.top })
  }
  const toggle = (n: NodeDef) => {
    const wasOn = !!enabled[n.id]
    toggleNode(n.id)
    if (!wasOn) selectNode(n.id)
  }
  // One tab stop for the switches; arrow keys, Home and End move between them (toolbar pattern).
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return
    const list = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('button[data-node]')]
    const i = list.indexOf(document.activeElement as HTMLButtonElement)
    if (i < 0) return
    e.preventDefault()
    const j = e.key === 'Home' ? 0 : e.key === 'End' ? list.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + list.length) % list.length
    list[j].focus()
    setActive(list[j].dataset.node ?? null)
  }

  const button = (n: NodeDef, isCommunity: boolean) => {
    const on = !!enabled[n.id]
    const selected = selectedNode === n.id
    const usable = !n.projects || n.projects.includes(project)
    const color = CATEGORIES[n.category].color
    const Icon = isCommunity ? cIcons.get(n.id) ?? null : NODE_ICONS[n.id] ?? null
    return (
      <button key={n.id} type="button" role="switch" aria-checked={on} aria-label={`Use ${n.name}`} data-node={n.id}
        aria-describedby={tip?.n.id === n.id ? 'node-bar-tip' : undefined} tabIndex={stop === n.id ? 0 : -1}
        onClick={() => toggle(n)} onMouseEnter={(e) => showTip(n, e.currentTarget)} onMouseLeave={() => setTip(null)}
        onFocus={(e) => { setActive(n.id); showTip(n, e.currentTarget) }} onBlur={() => setTip(null)}
        // UI review (3 Nov): colour belongs on the data, not the chrome. On: a white tile in ink with a bar in its category
        // colour; off: no tile, a faint icon and no bar. Selected (its results showing): an ink ring.
        className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-md border outline-none focus-visible:ring-2 focus-visible:ring-accent ${on ? 'border-line bg-panel text-ink' : 'border-transparent bg-transparent text-muted hover:border-line hover:text-ink'} ${selected ? 'ring-2 ring-ink ring-offset-1 ring-offset-panel' : ''} ${usable ? '' : 'opacity-40'}`}>
        {Icon ? <Icon size={16} /> : <span className="text-[11px] font-bold leading-none" aria-hidden>{initials(n.name)}</span>}
        {on && <span className="absolute inset-x-1 bottom-[2px] h-[3px] rounded-full" style={{ background: color }} aria-hidden />}
        {isCommunity && <span className="absolute -right-1 -top-1 rounded-sm bg-panel px-[2px] text-[7px] font-bold leading-[9px] text-ink ring-1 ring-line" aria-hidden>C</span>}
      </button>
    )
  }

  const t = tip?.n
  const tOn = t ? !!enabled[t.id] : false
  return (
    <div className="relative z-20 flex h-11 shrink-0 items-center gap-2 border-t border-line bg-panel px-2">
      <button ref={libButton} type="button" onClick={() => setLib((o) => !o)} aria-expanded={lib} aria-controls={lib ? 'node-library-pop' : undefined}
        className={`flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-accent ${lib ? 'border-accent bg-accent text-white' : 'border-line text-ink hover:border-accent'}`}>
        <Library size={14} />Library
      </button>
      {lib && <LibraryPopover onClose={() => setLib(false)} anchor={libButton} />}
      <div role="toolbar" aria-label="Checks: switch each on or off" onKeyDown={onKey} className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto py-1" onScroll={() => setTip(null)}>
        {groups.map((g, gi) => (
          <div key={g.label} className="flex items-center gap-1" role="group" aria-label={g.label}>
            {gi > 0 && <span className="mx-1 h-6 w-px shrink-0 bg-line" aria-hidden />}
            {g.nodes.map((n) => button(n, false))}
          </div>
        ))}
        {community.length > 0 && (
          <div className="flex items-center gap-1" role="group" aria-label="My nodes">
            <span className="mx-1 h-6 w-px shrink-0 bg-line" aria-hidden />
            {community.map((n) => button(n, true))}
          </div>
        )}
      </div>
      <span className="shrink-0 text-[11px] tabular-nums text-muted">{onCount} of {all.length} on</span>
      {t && (
        <div id="node-bar-tip" role="tooltip" className="pointer-events-none fixed z-50 max-w-[16rem] -translate-x-1/2 -translate-y-full rounded-md bg-ink px-2 py-1.5 text-[11px] leading-snug text-white shadow-lg"
          style={{ left: tip!.x, top: tip!.y - 6 }}>
          <div className="font-semibold">{t.name}</div>
          <div className="text-white/80">
            {tOn ? 'On' : 'Off'} · {CATEGORIES[t.category].label}{(t.status as string) === 'community' ? ' · Community' : ` · ${STAGE_NAME[stageOf(t)] ?? ''}`}
            {t.status === 'preview' ? ' · preview' : ''}{t.projects && !t.projects.includes(project) ? ` · runs in ${t.projects.includes('city') ? 'Real Vancouver' : 'Competition site'}` : ''}
          </div>
          <div className="text-white/70">{tOn ? 'Click to switch off' : 'Click to switch on and see its results'}</div>
        </div>
      )}
    </div>
  )
}
