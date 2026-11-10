// The workflow builder (Ruijie's Result A brief, 9 Nov): the project's design process as a readable sequence of
// illustrated tool cards, with a tool library on the left and a contextual inspector on the right. It is drawn over the
// whole workspace (the model, the phase panel and the results stay mounted under it, so nothing about the design, the
// camera, the open tool or the results changes by opening or closing it) and it reads and edits the one project
// workflow (lib/workflow/projectWorkflow.ts): every change goes through that store's commit, with its Undo and Redo;
// Apply keeps the changes and returns to where the user was; Discard puts back the workflow the builder opened with.
// Layout (brief §3): three columns at 1280 px and up (library about 256 px, the cards with the rest, inspector about
// 280 px, collapsible); narrower, the library and the inspector become drawers over the cards.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { PanelLeftOpen, PanelRightOpen, X } from '../icons'
import { useIntro } from '../../lib/intro'
import { useProjectWorkflow } from '../../lib/workflow/projectWorkflow'
import { useStore } from '../../store'
import BuilderHeader from './BuilderHeader'
import ToolLibrary from './ToolLibrary'
import WorkflowInspector from './WorkflowInspector'
import WorkflowSequence from './WorkflowSequence'
import { useBuilderUi } from './builderState'

const WIDE = 1180

export default function WorkflowBuilder() {
  const mode = useProjectWorkflow((s) => s.mode)
  const load = useProjectWorkflow((s) => s.load)
  const inspector = useBuilderUi((s) => s.inspector)
  const reduced = useStore((s) => s.reducedMotion)
  const box = useRef<HTMLElement>(null)
  const opener = useRef<HTMLElement | null>(null)
  const [width, setWidth] = useState(1440)
  const [drawer, setDrawer] = useState<'library' | 'inspector' | null>(null)
  const shown = mode === 'builder'

  // The workflow is the landing page's too: read it when the builder opens and whenever the landing page closes.
  useEffect(() => {
    if (!shown) return
    load()
    useBuilderUi.getState().select(null)
    setDrawer(null)
    return useIntro.subscribe((s, p) => { if (p.show && !s.show) useProjectWorkflow.getState().load() })
  }, [shown, load])
  // Focus moves into the builder when it opens, and back to what opened it when it closes (no keyboard trap outside).
  useEffect(() => {
    if (shown) {
      opener.current = document.activeElement as HTMLElement | null
      requestAnimationFrame(() => box.current?.querySelector<HTMLElement>('[data-testid="builder-name"]')?.focus())
    } else if (opener.current && document.contains(opener.current)) { opener.current.focus(); opener.current = null }
  }, [shown])
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el); setWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [shown])
  if (!shown) return null
  const wide = width >= WIDE

  // Tab stays inside the dialog (aria-modal): the last control wraps to the first and back.
  const trap = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || !box.current) return
    const list = [...box.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter((x) => x.offsetParent !== null)
    if (!list.length) return
    const first = list[0], last = list[list.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }

  const side = 'flex min-h-0 flex-col overflow-hidden rounded-xl border border-line bg-panel'
  return (
    <section ref={box} role="dialog" aria-modal="true" aria-label="Workflow builder" data-testid="workflow-builder" data-wide={wide ? '' : undefined} data-reduced={reduced ? '' : undefined}
      onKeyDown={trap} className="absolute inset-0 z-40 flex flex-col gap-2 overflow-hidden rounded-2xl bg-canvas p-2 text-ink">
      <BuilderHeader />
      {!wide && (
        <div className="flex items-center gap-1 px-1" data-testid="builder-drawers">
          <button type="button" onClick={() => setDrawer(drawer === 'library' ? null : 'library')} aria-expanded={drawer === 'library'} data-testid="drawer-library" className="flex h-8 items-center gap-1.5 rounded-lg border border-line bg-panel px-2.5 text-control outline-none focus-visible:ring-2 focus-visible:ring-accent"><PanelLeftOpen size={14} aria-hidden />Tools</button>
          <button type="button" onClick={() => setDrawer(drawer === 'inspector' ? null : 'inspector')} aria-expanded={drawer === 'inspector'} data-testid="drawer-inspector" className="flex h-8 items-center gap-1.5 rounded-lg border border-line bg-panel px-2.5 text-control outline-none focus-visible:ring-2 focus-visible:ring-accent"><PanelRightOpen size={14} aria-hidden />Details</button>
        </div>
      )}
      <div className="relative flex min-h-0 flex-1 gap-2">
        {wide && <aside aria-label="Tool library" className={`${side} w-64 shrink-0`}><ToolLibrary /></aside>}
        <main className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-line bg-panel"><WorkflowSequence /></main>
        {wide && (inspector
          ? <aside aria-label="Inspector" className={`${side} w-[280px] shrink-0`}><WorkflowInspector /></aside>
          : <aside aria-label="Inspector" className={`${side} w-10 shrink-0 items-center py-2`}><WorkflowInspector /></aside>)}
        {!wide && drawer && (
          <div className="absolute inset-0 z-10 flex" data-testid={`builder-drawer-${drawer}`}>
            <button type="button" aria-label="Close the drawer" onClick={() => setDrawer(null)} className="flex-1 bg-ink/20 outline-none" />
            <aside aria-label={drawer === 'library' ? 'Tool library' : 'Inspector'} className={`${side} w-[300px] shadow-float`}>
              <div className="flex justify-end border-b border-line px-2 py-1"><button type="button" onClick={() => setDrawer(null)} aria-label="Close" className="rounded-lg p-1 text-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"><X size={14} aria-hidden /></button></div>
              {drawer === 'library' ? <ToolLibrary /> : <WorkflowInspector />}
            </aside>
          </div>
        )}
      </div>
    </section>
  )
}
