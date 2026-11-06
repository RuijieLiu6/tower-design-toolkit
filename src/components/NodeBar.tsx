// Bottom bar of the guided app: every evaluation node as a switch, its icon with a key word under it (Ruijie, 6 Nov: the
// design tools' icon + key word treatment). The full name and what it checks show on hover and on keyboard focus;
// switching a node on also shows its results in the right panel. Search, workflow presets, My nodes and the
// roadmap live in the Library popover at the bar's left end.
import { Library, X } from './icons'
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

/** The key word under each check's icon: one or two words, taken from its name where possible (voice control). */
export const NODE_WORDS: Record<string, string> = {
  'built.vtc-rules': 'Hard rules', 'built.fsr': 'FSR', 'built.viewcones': 'View-cone', 'built.relax-aviation': 'Aviation',
  'built.sun': 'Shadow', 'built.core-lifts': 'Lift check', 'built.egress': 'Egress', 'built.life-safety': 'Life safety',
  'built.sky-room': 'Sky room', 'built.economics': 'Value', 'built.culture-claims': 'Claims', 'built.model': 'Model',
  'built.provenance': 'AI use', 'built.mobility': 'Parking', 'built.facade': 'Facade', 'built.interior': 'Interior',
  'built.daylight-depth': 'Daylight', 'built.view-from': 'View from', 'built.vista': 'Vista', 'built.heights': 'Height',
  'built.pr-streetwall': 'Streetwall', 'built.pr-frontage': 'Frontage', 'built.pr-ground': 'Open space',
  'built.city-in-nature': 'Nature', 'built.solar-access': 'Sun hours', 'built.wind-procedure': 'Slenderness',
  'built.structure': 'Structure', 'built.wind-study': 'Wind study', 'built.wind-screen': 'Wind screen', 'built.trips': 'Trips',
  'built.energy-carbon': 'Energy',
}
/** A node without a word of its own (a community node): the first word of its name. */
export const nodeWord = (n: { id: string; name: string }) => NODE_WORDS[n.id] ?? n.name.split(/[\s:&,(]+/).filter(Boolean)[0] ?? n.name

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
  const { phase, project, enabled, toggleNode, selectNode, selectedNode, analysis, setAnalysis } = useStore(useShallow((s) => ({
    phase: s.phase, project: s.project, enabled: s.enabled, toggleNode: s.toggleNode, selectNode: s.selectNode, selectedNode: s.selectedNode,
    analysis: s.analysis, setAnalysis: s.setAnalysis,
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
        className={`relative flex w-[3.9rem] shrink-0 flex-col items-center gap-[3px] rounded-md border px-0.5 pb-0.5 pt-1 outline-none focus-visible:ring-2 focus-visible:ring-accent ${on ? 'border-line bg-panel text-ink' : 'border-transparent bg-transparent text-muted hover:border-line hover:text-ink'} ${selected ? 'ring-2 ring-ink ring-offset-1 ring-offset-panel' : ''}`}>
        {/* A check that runs only in the other project: its icon is faded; its word stays readable (contrast), in grey. */}
        <span className={`relative flex h-5 w-6 items-center justify-center ${usable ? '' : 'opacity-40'}`}>
          {Icon ? <Icon size={16} /> : <span className="text-[11px] font-bold leading-none" aria-hidden>{initials(n.name)}</span>}
          {on && <span className="absolute inset-x-0 -bottom-[3px] h-[3px] rounded-full" style={{ background: color }} aria-hidden />}
        </span>
        <span aria-hidden className={`w-full truncate text-center text-[10px] leading-tight ${!usable ? 'text-muted' : on ? 'font-medium' : ''}`}>{nodeWord(n)}</span>
        {isCommunity && <span className="absolute -right-1 -top-1 rounded-sm bg-panel px-[2px] text-[7px] font-bold leading-[9px] text-ink ring-1 ring-line" aria-hidden>C</span>}
      </button>
    )
  }

  const t = tip?.n
  const tOn = t ? !!enabled[t.id] : false
  return (
    <div className="relative z-20 flex h-14 shrink-0 items-center gap-2 border-t border-line bg-panel px-2">
      <button ref={libButton} type="button" onClick={() => setLib((o) => !o)} aria-expanded={lib} aria-controls={lib ? 'node-library-pop' : undefined}
        className={`flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-accent ${lib ? 'border-accent bg-accent text-white' : 'border-line text-ink hover:border-accent'}`}>
        <Library size={14} />Library
      </button>
      {lib && <LibraryPopover onClose={() => setLib(false)} anchor={libButton} />}
      {/* Analysis off (process rail switch): the checks don't run, so their switches give way to one way back on. */}
      {!analysis && (
        <p data-testid="analysis-off-bar" className="flex min-w-0 flex-1 items-center gap-2 text-[11px] text-muted">
          Analysis is off: no check runs.
          <button type="button" onClick={() => setAnalysis(true)} className="rounded-md border border-line px-2 py-0.5 text-[11px] text-ink outline-none hover:border-accent focus-visible:ring-2 focus-visible:ring-accent">Run analysis</button>
        </p>
      )}
      {analysis && <div role="toolbar" aria-label="Checks: switch each on or off" onKeyDown={onKey} className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto py-1" onScroll={() => setTip(null)}>
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
      </div>}
      {analysis && <span className="shrink-0 text-[11px] tabular-nums text-muted">{onCount} of {all.length} on</span>}
      {t && (
        <div id="node-bar-tip" role="tooltip" className="pointer-events-none fixed z-50 max-w-[16rem] -translate-x-1/2 -translate-y-full rounded-md bg-ink px-2 py-1.5 text-[11px] leading-snug text-white shadow-lg"
          style={{ left: tip!.x, top: tip!.y - 6 }}>
          <div className="font-semibold">{t.name}</div>
          {t.question && <div className="mb-0.5 text-white/90">{t.question}</div>}
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
