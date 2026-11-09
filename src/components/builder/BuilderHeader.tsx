// The workflow builder's header (Result A brief §3: "workflow name; a compact preset selector or Start from preset
// action; one short description, which can be dismissed; Apply changes / Continue designing as appropriate to the
// editing state. Keep the project name and workflow name distinguishable"). Left: the workflow's name (click to rename)
// with the project's name beside it in small type, and Start from preset. Right: Undo / Redo, then Discard changes and
// Apply changes while the workflow differs from the one the builder opened with, else Continue designing; and a quiet
// link to the advanced data graph. Everything edits the project workflow store (lib/workflow/projectWorkflow.ts).
import { useEffect, useRef, useState, type KeyboardEvent as RKeyboardEvent } from 'react'
import { Check, ChevronDown, Redo2, Undo2, X } from '../icons'
import { useStore } from '../../store'
import { navigate } from '../../lib/route'
import { presetById, USER_TYPES, type Preset } from '../../lib/userTypes'
import { listMyPresets, type MyPreset } from '../../lib/workflow/myPresets'
import { withDesignSteps } from '../../lib/workflow/designNodes'
import { linear } from '../../lib/workflowGraph'
import { changedSinceOpen, closeBuilder, useProjectWorkflow } from '../../lib/workflow/projectWorkflow'
import { homeOf } from '../workflow/WorkflowOverview'
import { useBuilderUi } from './builderState'

const PROJECT_NAME = { vtc: 'Competition site', city: 'Real Vancouver' } as const
export const BUILDER_INTRO = 'Arrange the tools you will use, in the order you will work; add return paths to revisit a step. Open tool takes you to the workspace.'

const btn = 'flex h-8 items-center gap-1 rounded-lg px-2.5 text-control text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40'
const iconBtn = 'flex h-8 w-8 items-center justify-center rounded-lg bg-panel text-ink outline-none hover:bg-subtle focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40'

export default function BuilderHeader() {
  const w = useProjectWorkflow()
  const project = useStore((s) => s.project)
  const introHidden = useBuilderUi((s) => s.introHidden)
  const hideIntro = useBuilderUi((s) => s.hideIntro)
  const dirty = changedSinceOpen()
  const name = w.wf.customName ?? (w.wf.presetId ? presetById(w.wf.presetId)?.name : null) ?? 'My workflow'

  return (
    <header data-testid="builder-header" className="border-b border-line bg-panel px-4 py-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-meta font-medium text-muted">Workflow</span>
          <Name name={name} onRename={w.rename} />
          <span className="text-meta text-muted" title="The project this workflow is for">{PROJECT_NAME[project]}</span>
        </div>
        <PresetPicker />
        <div className="ml-auto flex flex-wrap items-center gap-1">
          <button type="button" onClick={w.undo} disabled={!w.past.length} data-testid="builder-undo" aria-label="Undo the last workflow change" title="Undo" className={iconBtn}><Undo2 size={15} aria-hidden /></button>
          <button type="button" onClick={w.redo} disabled={!w.future.length} data-testid="builder-redo" aria-label="Redo" title="Redo" className={iconBtn}><Redo2 size={15} aria-hidden /></button>
          {dirty ? (
            <>
              <button type="button" onClick={() => closeBuilder('discard')} data-testid="builder-discard" title="Put back the workflow you had when you opened the builder, and return to the design"
                className={`${btn} bg-panel text-error hover:bg-subtle`}><X size={14} aria-hidden />Discard changes</button>
              <button type="button" onClick={() => closeBuilder('apply')} data-testid="builder-apply" title="Keep these changes and go back to the design"
                className="flex h-8 items-center gap-1 rounded-lg bg-accent px-3 text-control text-white outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"><Check size={14} aria-hidden />Apply changes</button>
            </>
          ) : (
            <button type="button" onClick={() => closeBuilder('apply')} data-testid="builder-continue" title="Back to the design, where you were"
              className="flex h-8 items-center gap-1 rounded-lg bg-accent px-3 text-control text-white outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"><Check size={14} aria-hidden />Continue designing</button>
          )}
          <button type="button" onClick={() => { closeBuilder('apply', { keep: true }); navigate('customize') }} data-testid="builder-advanced" title="The data graph: which node reads which node's output (for advanced use)"
            className="ml-1 rounded-lg px-1.5 py-1 text-meta text-muted underline-offset-2 outline-none hover:text-ink hover:underline focus-visible:ring-2 focus-visible:ring-accent">Advanced: data graph</button>
        </div>
      </div>
      {!introHidden && (
        <p data-testid="builder-intro" className="mt-1 flex items-center gap-2 text-meta text-muted">
          <span className="min-w-0 truncate" title={BUILDER_INTRO}>{BUILDER_INTRO}</span>
          <button type="button" onClick={hideIntro} data-testid="builder-intro-hide" aria-label="Hide this description" title="Hide"
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-lg text-muted outline-none hover:bg-subtle hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"><X size={12} aria-hidden /></button>
        </p>
      )}
    </header>
  )
}

/** The name as a button; clicking makes it an input. Enter or blur applies, Esc cancels. */
function Name({ name, onRename }: { name: string; onRename: (n: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  const cancel = useRef(false)
  const back = useRef<HTMLButtonElement>(null)
  useEffect(() => { if (!editing) setDraft(name) }, [name, editing])
  const done = (apply: boolean) => {
    setEditing(false)
    if (apply && draft.trim() && draft.trim() !== name) onRename(draft)
    requestAnimationFrame(() => back.current?.focus({ preventScroll: true }))
  }
  if (editing) return (
    <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} data-testid="builder-name-input" aria-label="Workflow name"
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); done(true) } else if (e.key === 'Escape') { e.stopPropagation(); cancel.current = true; done(false) } }}
      onBlur={() => { if (cancel.current) { cancel.current = false; return } done(true) }}
      onFocus={(e) => e.currentTarget.select()}
      className="h-8 w-56 rounded-lg border border-boundary bg-white px-2 text-section font-semibold text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent" />
  )
  return (
    <button ref={back} type="button" onClick={() => setEditing(true)} data-testid="builder-name" title="Rename this workflow"
      className="max-w-[18rem] truncate rounded-lg px-1 text-section font-semibold text-ink outline-none hover:bg-subtle focus-visible:ring-2 focus-visible:ring-accent">{name}</button>
  )
}

/**
 * Start from preset: a listbox of the library presets, grouped by who they are for, then My presets (saved copies).
 * Choosing one replaces the board as one undo step and notes the preset it started from; the library preset itself is
 * never changed. The arrow keys move between options; Esc or a click outside closes it.
 */
function PresetPicker() {
  const w = useProjectWorkflow()
  const [open, setOpen] = useState(false)
  const [mine, setMine] = useState<MyPreset[]>([])
  const box = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    setMine(listMyPresets())
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    window.addEventListener('pointerdown', away, true)
    requestAnimationFrame(() => box.current?.querySelector<HTMLElement>('[role="option"][aria-selected="true"], [role="option"]')?.focus())
    return () => window.removeEventListener('pointerdown', away, true)
  }, [open])
  const close = () => { setOpen(false); requestAnimationFrame(() => trigger.current?.focus({ preventScroll: true })) }
  const pickLibrary = (p: Preset) => {
    const nodes = withDesignSteps(p.nodes, (id) => homeOf(id))
    w.replaceWith({ nodes, edges: linear(nodes) }, { presetId: p.id, customName: null, role: p.type }, `Started from the preset ${p.name}`)
    close()
  }
  const pickMine = (p: MyPreset) => {
    w.replaceWith({ nodes: p.nodes, edges: p.edges }, { presetId: null, customName: p.name }, `Started from your preset ${p.name}`)
    close()
  }
  const onKey = (e: RKeyboardEvent) => {
    if (e.key === 'Escape') { e.stopPropagation(); close(); return }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return
    const opts = [...(box.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])]
    if (!opts.length) return
    const i = opts.indexOf(document.activeElement as HTMLElement)
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? opts.length - 1 : e.key === 'ArrowDown' ? Math.min(opts.length - 1, i + 1) : Math.max(0, i - 1)
    e.preventDefault()
    opts[next]?.focus()
  }
  const current = w.wf.presetId
  const option = 'flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-control text-ink outline-none hover:bg-subtle focus-visible:ring-2 focus-visible:ring-accent aria-selected:bg-selected aria-selected:text-accent-hover'
  return (
    <div ref={box} className="relative" onKeyDown={onKey}>
      <button ref={trigger} type="button" onClick={() => setOpen(!open)} data-testid="builder-preset" aria-haspopup="listbox" aria-expanded={open}
        title="Replace this workflow with a starting preset (one Undo step takes it back)" className={`${btn} bg-panel hover:bg-subtle`}>
        Start from preset<ChevronDown size={13} aria-hidden />
      </button>
      {open && (
        <ul role="listbox" aria-label="Starting presets" data-testid="builder-preset-list"
          className="absolute left-0 top-full z-50 mt-1 max-h-[70vh] w-80 overflow-y-auto rounded-xl border border-line bg-panel p-1.5 shadow-float" style={{ scrollbarWidth: 'thin' }}>
          {USER_TYPES.map((t) => (
            <li key={t.id} role="presentation">
              <ul role="group" aria-label={t.name}>
                <li role="presentation" className="px-2 pb-0.5 pt-1.5 text-meta font-semibold text-muted">{t.name}</li>
                {t.presets.map((p) => (
                  <li key={p.id} role="presentation">
                    <button type="button" role="option" aria-selected={current === p.id} data-preset={p.id} onClick={() => pickLibrary(p)} title={p.goal} className={option}>
                      <span className="min-w-0 flex-1">
                        <span className="block">{p.name}</span>
                        <span className="block text-meta font-normal text-muted">{p.nodes.length} checks · {PROJECT_NAME[p.project]}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
          <li role="presentation">
            <ul role="group" aria-label="My presets">
              <li role="presentation" className="px-2 pb-0.5 pt-1.5 text-meta font-semibold text-muted">My presets</li>
              {mine.map((p) => (
                <li key={p.id} role="presentation">
                  <button type="button" role="option" aria-selected={!current && w.wf.customName === p.name} data-preset={p.id} onClick={() => pickMine(p)} className={option}>
                    <span className="min-w-0 flex-1">
                      <span className="block">{p.name}</span>
                      <span className="block text-meta font-normal text-muted">{p.nodes.length} tools · saved {new Date(p.savedAt).toLocaleDateString('en-CA')}</span>
                    </span>
                  </button>
                </li>
              ))}
              {!mine.length && <li role="presentation" className="px-2 py-1 text-meta text-muted">None yet: Save as preset keeps a copy of a workflow here.</li>}
            </ul>
          </li>
        </ul>
      )}
    </div>
  )
}
