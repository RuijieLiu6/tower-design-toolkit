import { ChevronDown, ChevronRight, FlaskConical, Search } from './icons'
import { useMemo, useState } from 'react'
import { CATEGORY_ICONS } from '../data/icons'
import { ALL_NODES, BUILT_NODES, CATEGORIES, WORKFLOWS, type Category, type NodeDef } from '../data/registry'
import { useStore } from '../store'
import { BuildYourOwn, MyNodes, NoMatch, useMyNodeMatches } from './NodeBuilder'
import { Toggle } from './ui'
import { useShallow } from 'zustand/react/shallow'

/** Design stage a node belongs to. Categories decide first, so each stage has its own toolset. */
const ADVANCED_CATS = ['STRC', 'SYST', 'SPAC', 'ENER', 'MOBI']
export function stageOf(n: NodeDef): 'basic' | 'advanced' | 'present' | 'platform' {
  if (n.category === 'PRES' || n.phase === 'present') return 'present'
  if (n.category === 'DATA' || n.phase === 'platform') return 'platform'
  if (n.phase === 'advanced' || ADVANCED_CATS.includes(n.category)) return 'advanced'
  return 'basic'
}

function CategoryBadge({ cat, size = 14 }: { cat: Category; size?: number }) {
  const Icon = CATEGORY_ICONS[cat]
  return <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white" style={{ background: CATEGORIES[cat].color }}><Icon size={size} /></span>
}

function BuiltRow({ n }: { n: NodeDef }) {
  // Only this row's own state, so flipping one switch doesn't re-render all the rows (mouse response, 4 Nov).
  const { project, on, toggleNode, selectNode, selected } = useStore(useShallow((s) => ({ project: s.project, on: !!s.enabled[n.id], toggleNode: s.toggleNode, selectNode: s.selectNode, selected: s.selectedNode === n.id })))
  const usable = !n.projects || n.projects.includes(project)
  return (
    <div onClick={() => selectNode(n.id)} className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-black/5 ${selected ? 'bg-accent/10' : ''}`}>
      <CategoryBadge cat={n.category} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium text-ink">{n.name}</div>
        <div className="text-[10px] text-muted">{CATEGORIES[n.category].label}{!usable && <span className="text-amber-700"> · other project</span>}{n.status === 'preview' && ' · preview'}</div>
      </div>
      <div onClick={(e) => e.stopPropagation()}><Toggle checked={on} onChange={() => toggleNode(n.id)} label={`Use ${n.name}`} /></div>
    </div>
  )
}

export default function NodeLibrary() {
  const { phase, selectNode, selectedNode, setEnabled, libraryQuery, set } = useStore(useShallow((s) => ({ phase: s.phase, selectNode: s.selectNode, selectedNode: s.selectedNode, setEnabled: s.setEnabled, libraryQuery: s.libraryQuery, set: s.set })))
  const [platform, setPlatform] = useState(false)
  const [roadmapOpen, setRoadmapOpen] = useState(false)
  const [carriedOpen, setCarriedOpen] = useState(false)
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const q = libraryQuery.trim().toLowerCase()
  const match = (n: NodeDef) => !q || `${n.name} ${n.question} ${n.id}`.toLowerCase().includes(q)

  // Opened from the bottom bar's Library popover; Present has no checks of its own, so it lists them all.
  const builtHere = BUILT_NODES.filter((n) => (phase === 'present' || stageOf(n) === phase) && match(n))
  const carried = phase === 'advanced' ? BUILT_NODES.filter((n) => stageOf(n) === 'basic' && match(n)) : []
  const groups = useMemo(() => {
    const list = ALL_NODES.filter((n) => n.status === 'researched' && (stageOf(n) === phase || (platform && stageOf(n) === 'platform')) && match(n))
    const g = new Map<Category, NodeDef[]>()
    for (const n of list) g.set(n.category, [...(g.get(n.category) ?? []), n])
    for (const [, arr] of g) arr.sort((a, b) => ['core', 'v1', 'roadmap'].indexOf(a.priority) - ['core', 'v1', 'roadmap'].indexOf(b.priority))
    return (Object.keys(CATEGORIES) as Category[]).filter((c) => g.has(c)).map((c) => [c, g.get(c)!] as const)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, platform, q])
  const researchedCount = groups.reduce((s, [, a]) => s + a.length, 0)
  const showRoadmap = roadmapOpen || q.length > 0
  const mine = useMyNodeMatches(q)
  const nothingFound = q.length > 0 && !builtHere.length && !carried.length && !researchedCount && !mine

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-line p-3">
        <label className="flex items-center gap-2 rounded-md border border-line bg-panel px-2 py-1.5 focus-within:border-accent">
          <Search size={14} className="text-muted" />
          <input value={libraryQuery} onChange={(e) => set({ libraryQuery: e.target.value })} placeholder="Search nodes: shadow, FSR, wind" className="w-full bg-transparent text-xs outline-none" aria-label="Search nodes" />
        </label>
        {phase === 'basic' && (
          <div className="mt-2 flex flex-wrap gap-1">
            {WORKFLOWS.map((w) => <button key={w.id} onClick={() => setEnabled(w.nodes)} className="rounded-full border border-line px-2 py-0.5 text-[10px] text-muted hover:border-accent hover:text-accent">{w.name}</button>)}
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {nothingFound && <NoMatch query={libraryQuery} />}
        <h3 className="px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wider text-muted">{phase === 'advanced' ? 'New in Schematic' : 'Checks'}</h3>
        {builtHere.map((n) => <BuiltRow key={n.id} n={n} />)}
        {phase === 'advanced' && builtHere.length === 0 && (
          <p className="px-2 pb-2 text-[11px] text-muted">The plates, core and plant shown in the model are drawn from your inputs. Their evaluation nodes (lifts, core share, plant, facade) are researched and next to build.</p>
        )}
        {carried.length > 0 && (
          <div className="mt-1">
            <button onClick={() => setCarriedOpen((o) => !o)} aria-expanded={carriedOpen} className="flex w-full items-center gap-1.5 px-2 py-1 text-[11px] text-muted hover:text-ink">
              {carriedOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}Carried from Massing · {carried.length} checks still running
            </button>
            {carriedOpen && carried.map((n) => <BuiltRow key={n.id} n={n} />)}
          </div>
        )}

        <MyNodes q={q} />

        <div className="mt-3 border-t border-line pt-2">
          <button onClick={() => setRoadmapOpen((o) => !o)} aria-expanded={showRoadmap} className="flex w-full items-center gap-1.5 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted hover:text-ink">
            {showRoadmap ? <ChevronDown size={12} /> : <ChevronRight size={12} />}<FlaskConical size={13} />Roadmap · {researchedCount} researched
          </button>
          {showRoadmap && (
            <>
              <label className="flex items-center gap-1.5 px-2 py-1 text-[10px] text-muted" title="Data, storage, licences and other platform plumbing">
                <input type="checkbox" checked={platform} onChange={(e) => setPlatform(e.target.checked)} /> Include platform and data modules
              </label>
              {groups.map(([cat, nodes]) => (
                <div key={cat}>
                  <button className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-black/5" onClick={() => setOpen((o) => ({ ...o, [cat]: !o[cat] }))} aria-expanded={!!open[cat]}>
                    <CategoryBadge cat={cat} size={12} />
                    <span className="flex-1 text-xs">{CATEGORIES[cat].label}</span>
                    <span className="font-mono text-[10px] text-muted">{nodes.length}</span>
                  </button>
                  {open[cat] && nodes.map((n) => (
                    <div key={n.id} onClick={() => selectNode(n.id)} aria-disabled="true" title="Researched, not runnable yet"
                      className={`flex cursor-pointer items-start gap-2 rounded-md py-1 pl-10 pr-2 hover:bg-black/5 ${selectedNode === n.id ? 'bg-accent/10' : ''}`}>
                      <FlaskConical size={12} className="mt-0.5 shrink-0 text-muted" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[11px] text-ink/80" title={n.name}>{n.name}</div>
                        <div className="text-[9px] uppercase text-muted">{n.priority}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </>
          )}
        </div>
        <BuildYourOwn />
      </div>
    </div>
  )
}
