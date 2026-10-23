// Customize: an immersive workflow builder. Icon nodes from every category, typed wires, workflow logic,
// live results from the same engines as the guided app, local save/load, JSON export/import, and
// "Run in the guided app", which switches on exactly this workflow's checks there.
import {
  Background, BackgroundVariant, Controls, MiniMap, Panel, ReactFlow, ReactFlowProvider, SelectionMode, useReactFlow,
  type Edge, type FinalConnectionState, type OnBeforeDelete,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { ChevronDown, Download, FilePlus2, FolderOpen, PanelRightOpen, Play, Route as RouteIcon, Save, Scale, Trash, Upload, Users, Workflow } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent as RMouseEvent, type ReactNode } from 'react'
import CommunityDrawer from '../components/community/CommunityDrawer'
import { catalog, findEntry, isRunnable, type Entry, type TabId } from '../components/workflow/catalog'
import { NodeBuilderHost, openNodeBuilder, useCommunityNodes, useCommunityOutput } from '../components/workflow/community'
import { restoreDraft, startDraftAutosave, TEMPLATES, toGraph, useEditor, type WfNodeT } from '../components/workflow/editorStore'
import QuickSearch from '../components/workflow/QuickSearch'
import Ribbon, { DRAG_MIME } from '../components/workflow/Ribbon'
import WfInspector from '../components/workflow/WfInspector'
import { CommunityContext, nodeTypes, OutputsContext } from '../components/workflow/WfNodes'
import { USES } from '../engine/types'
import { useCultureGate } from '../components/CultureResults'
import { useProvenanceIssues } from '../components/ProvenanceResults'
import { useEconomics } from '../hooks/useEconomics'
import { useFacade } from '../hooks/useFacade'
import { useMobility } from '../hooks/useMobility'
import { useResults } from '../hooks/useResults'
import { extraOutput } from '../lib/extraLive'
import { SOLAR_NODE, useSolarAccess } from '../hooks/useSolarAccess'
import { startPersistence, whenRestored } from '../lib/project/session'
import { navigate } from '../lib/route'
import { builtOutput } from '../lib/workflowLive'
import { canConnect, evaluateGraph, isLogic, SOURCES, type GraphNode, type NodeOutput } from '../lib/workflowLogic'
import { browserStorage, deleteWorkflow, exportName, listWorkflows, loadWorkflow, nodesToEnable, parseWorkflow, saveWorkflow, serializeWorkflow, type SavedEntry } from '../lib/workflows'
import { useStore, useTowers, type ProjectKind } from '../store'

const PROJECTS: { id: ProjectKind; label: string }[] = [{ id: 'vtc', label: 'Competition site' }, { id: 'city', label: 'Real Vancouver' }]
const typing = (t: EventTarget | null) => { const el = t as HTMLElement | null; return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable) }

function Menu({ label, icon, open, setOpen, children }: { label: string; icon: ReactNode; open: boolean; setOpen: (o: boolean) => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('mousedown', close); window.addEventListener('keydown', esc)
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('keydown', esc) }
  }, [open, setOpen])
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} aria-label={label} aria-haspopup="menu" aria-expanded={open} className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs outline-none hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-accent">
        {icon}<span className="hidden xl:inline">{label}</span><ChevronDown size={12} aria-hidden />
      </button>
      {open && <div role="menu" className="absolute left-0 top-full z-50 mt-1 w-72 rounded-lg border border-line bg-panel p-1 shadow-xl">{children}</div>}
    </div>
  )
}

function Builder() {
  const rf = useReactFlow<WfNodeT, Edge>()
  const nodes = useEditor((s) => s.nodes)
  const edges = useEditor((s) => s.edges)
  const name = useEditor((s) => s.name)
  const message = useEditor((s) => s.message)
  const dirty = useEditor((s) => s.dirty)
  const ed = useEditor.getState
  const project = useStore((s) => s.project)
  const setProject = useStore((s) => s.setProject)
  const enabled = useStore((s) => s.enabled)
  const reduced = useStore((s) => s.reducedMotion)
  const towers = useTowers()
  const results = useResults()
  // Nodes whose results live outside useResults (import session: economics, parking, facade, claims guard, provenance).
  const econ = useEconomics().result, mobility = useMobility(), facade = useFacade(), culture = useCultureGate(), provenance = useProvenanceIssues()
  const community = useCommunityNodes()
  const entries = useMemo(() => catalog(community), [community])
  const communityOutput = useCommunityOutput()
  // Solar access runs in a worker; it runs here whenever its node sits on the canvas.
  const solarLines = useSolarAccess(nodes.some((n) => n.data.ref === SOLAR_NODE)).out?.lines ?? null

  const [tab, setTab] = useState<TabId>('SITE')
  const [search, setSearch] = useState<{ x: number; y: number } | null>(null)
  const [inspector, setInspector] = useState(true)
  const [menu, setMenu] = useState<'new' | 'open' | null>(null)
  const [communityOpen, setCommunityOpen] = useState(false)
  const [saved, setSaved] = useState<SavedEntry[]>([])
  const [fit, setFit] = useState(0)
  const wrap = useRef<HTMLDivElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const kv = useMemo(() => browserStorage(), [])

  // First visit: the last canvas, else the guided defaults so there is something live to rearrange.
  useEffect(() => {
    const s = ed()
    if (!s.nodes.length) {
      const draft = restoreDraft()
      if (draft?.nodes.length) { s.load(draft); s.say('Restored your last canvas') }
      else { s.load(TEMPLATES[0].make(Object.keys(enabled).filter((k) => enabled[k]))); s.say('Started from the guided defaults. Rearrange it, or start over from New.') }
    }
    // Back to where you were (also after a reload); a fresh canvas is fitted to the view.
    const vp = ed().viewport
    const t = vp ? setTimeout(() => rf.setViewport(vp), 0) : undefined
    if (!vp) setFit((f) => f + 1)
    const stop = startDraftAutosave()
    return () => { clearTimeout(t); stop() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => { document.title = `${name || 'Workflow'} · Customize · Tower Design Toolkit` }, [name])
  // The open project is restored and autosaved here too, so a page opened first can't lose it (or be undone by it).
  useEffect(() => startPersistence(), [])
  useEffect(() => {
    if (!fit) return
    const t = setTimeout(() => rf.fitView({ padding: 0.18, duration: reduced ? 0 : 300, maxZoom: 1 }), 60)
    return () => clearTimeout(t)
  }, [fit, rf, reduced])

  // ---- live evaluation (re-runs when structure, params or the design change; not while dragging) ----
  const structKey = nodes.map((n) => `${n.id}|${n.data.ref}|${n.data.label}|${n.parentId ?? ''}|${JSON.stringify(n.data.params ?? null)}`).join(';')
  const graph = useMemo<GraphNode[]>(() => toGraph(nodes), [structKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const edgeKey = edges.map((e) => `${e.source}.${e.sourceHandle}>${e.target}.${e.targetHandle}`).join(';')
  const outputs = useMemo<Record<string, NodeOutput>>(() => {
    const t0 = towers[0]
    const sourceHeadline = (ref: string) => {
      if (ref === 'src.site') return project === 'vtc' ? 'VTC block · supplied context model' : 'Downtown · City view cones, footprints, terrain'
      if (ref === 'src.massing') return `${towers.length} tower${towers.length === 1 ? '' : 's'} · ${towers.map((t) => `${Math.round(t.height)} m`).join(', ')}`
      return t0 ? t0.bands.map((b) => `${USES[b.use].label.split(' ')[0]} ${Math.round(b.share * 100)}%`).join(' · ') : 'No tower'
    }
    const evalNode = (n: GraphNode): NodeOutput => {
      const e = findEntry(n.ref, community)
      if (!e?.def) return { state: 'idle', headline: 'Not in this library', items: [] }
      if (e.status === 'researched') return { state: 'idle', headline: 'Researched, not runnable', items: [] }
      if (e.status === 'community') return communityOutput(e.def) ?? { state: 'idle', headline: 'Imported node: no result yet', items: [] }
      return builtOutput(e.def, results, project, solarLines) ?? extraOutput(e.def.id, { econ, mobility, facade, culture, provenance }) ?? { state: 'idle', headline: 'Built: open it in the guided app for results', items: [] }
    }
    return evaluateGraph(graph, edges, { evalNode, sourceHeadline, towers: towers.map((t) => ({ id: t.id, name: t.name })) })
  }, [graph, edgeKey, results, project, towers, community, communityOutput, solarLines, econ, mobility, facade, culture, provenance]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- adding nodes ----
  const centre = useCallback(() => {
    const r = wrap.current?.getBoundingClientRect()
    const p = rf.screenToFlowPosition({ x: (r?.left ?? 0) + (r?.width ?? 800) / 2, y: (r?.top ?? 0) + (r?.height ?? 600) / 2 })
    const jitter = (ed().nodes.length % 5) * 24
    return { x: p.x - 116 + jitter, y: p.y - 50 + jitter }
  }, [rf, ed])
  const add = useCallback((e: Entry, at?: { x: number; y: number }) => { ed().addEntry(e, at ?? centre()) }, [centre, ed])
  const openSearch = useCallback((x?: number, y?: number) => {
    const r = wrap.current?.getBoundingClientRect()
    setSearch({ x: x ?? (r ? r.left + r.width / 2 - 180 : 200), y: y ?? (r ? r.top + 80 : 160) })
  }, [])

  const onDrop = (ev: DragEvent) => {
    const ref = ev.dataTransfer.getData(DRAG_MIME)
    const e = ref ? entries.find((x) => x.ref === ref) : null
    if (!e) return
    ev.preventDefault()
    const p = rf.screenToFlowPosition({ x: ev.clientX, y: ev.clientY })
    add(e, { x: p.x - 116, y: p.y - 30 })
  }
  const onDoubleClick = (ev: RMouseEvent) => {
    if ((ev.target as HTMLElement).closest('.react-flow__pane')) openSearch(ev.clientX, ev.clientY)
  }

  // ---- connections ----
  const isValidConnection = useCallback((c: Edge | { source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null }) => canConnect(toGraph(ed().nodes), ed().edges, c).ok, [ed])
  const onConnectEnd = useCallback((_: unknown, st: FinalConnectionState) => {
    if (st.isValid || !st.toHandle || !st.fromHandle) return
    const from = st.fromHandle.type === 'source' ? st.fromHandle : st.toHandle, to = st.fromHandle.type === 'source' ? st.toHandle : st.fromHandle
    const r = canConnect(toGraph(ed().nodes), ed().edges, { source: from.nodeId, sourceHandle: from.id, target: to.nodeId, targetHandle: to.id })
    if (!r.ok) ed().say(`Can't connect: ${r.reason}`)
  }, [ed])
  const onBeforeDelete: OnBeforeDelete<WfNodeT, Edge> = useCallback(async ({ nodes: dn, edges: de }) => {
    const groupIds = dn.filter((n) => n.type === 'wfgroup').map((n) => n.id)
    if (!groupIds.length) return true
    // Deleting a group frame keeps its members (and their wires) on the canvas.
    const gs = new Set(groupIds)
    const keep = dn.filter((n) => !(n.parentId && gs.has(n.parentId) && !n.selected))
    const ids = new Set(keep.map((n) => n.id))
    ed().releaseChildren(groupIds)
    return { nodes: keep, edges: de.filter((e) => e.selected || ids.has(e.source) || ids.has(e.target)) }
  }, [ed])

  // ---- workflows ----
  const save = useCallback(() => {
    const wf = ed().toWorkflow()
    if (saveWorkflow(kv, wf)) { useEditor.setState({ dirty: false }); ed().say(`Saved "${wf.name}" in this browser`) }
    else ed().say('Could not save: browser storage is off or full. Use Export instead.')
  }, [ed, kv])
  const exportJson = () => {
    const wf = { ...ed().toWorkflow(), project }
    const url = URL.createObjectURL(new Blob([serializeWorkflow(wf)], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url; a.download = exportName(wf); a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    ed().say(`Exported ${exportName(wf)}`)
  }
  const importFile = async (f: File | undefined) => {
    if (!f) return
    if (f.size > 2_000_000) { ed().say('That file is over 2 MB; a workflow is usually a few KB.'); return }
    const known = (ref: string, kind: string) => (kind === 'source' ? SOURCES.some((s) => s.ref === ref) : kind === 'logic' ? isLogic(ref) : !!findEntry(ref, community))
    const r = parseWorkflow(await f.text(), known)
    if (!r.ok) { ed().say(`Could not import ${f.name}: ${r.errors.slice(0, 2).join(' ')}${r.errors.length > 2 ? ` (+${r.errors.length - 2} more)` : ''}`); return }
    ed().load(r.workflow)
    if (r.workflow.project && r.workflow.project !== project) setProject(r.workflow.project)
    ed().say(`Imported "${r.workflow.name}"${r.warnings.length ? `. ${r.warnings.length} warning${r.warnings.length > 1 ? 's' : ''}: ${r.warnings[0]}` : ''}`)
    setFit((x) => x + 1)
  }
  const runInGuided = async () => {
    await whenRestored() // else restoring the autosave in the guided app would switch these checks back
    const wf = ed().toWorkflow()
    const ids = nodesToEnable(wf, (ref) => isRunnable(findEntry(ref, community)))
    if (!ids.length) { ed().say('This workflow has no runnable checks yet: add a built node (coloured icon) first.'); return }
    useStore.getState().setEnabled(ids)
    useStore.setState({ showOnboarding: false, selectedNode: ids[0], announce: `Workflow "${wf.name}": ${ids.length} checks switched on` })
    navigate('guided')
  }

  // ---- keyboard ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      const k = e.key.toLowerCase()
      if (mod && k === 's') { e.preventDefault(); save(); return }
      if (typing(e.target) || search) return
      if (!mod && e.key === '/') { e.preventDefault(); openSearch(); return }
      if (mod && k === 'k') { e.preventDefault(); openSearch(); return }
      if (mod && k === 'z' && !e.shiftKey) { e.preventDefault(); ed().undo(); return }
      if (mod && ((k === 'z' && e.shiftKey) || k === 'y')) { e.preventDefault(); ed().redo(); return }
      if (mod && k === 'g' && !e.shiftKey) { e.preventDefault(); ed().groupSelected(); return }
      if (mod && k === 'g' && e.shiftKey) { e.preventDefault(); ed().nodes.filter((n) => n.selected && n.type === 'wfgroup').forEach((g) => ed().ungroup(g.id)); return }
      if (mod && k === 'd') { e.preventDefault(); ed().duplicateSelected(); return }
      if (mod && k === 'a') { e.preventDefault(); useEditor.setState((s) => ({ nodes: s.nodes.map((n) => (n.selected ? n : { ...n, selected: true })) })); return }
      if (!mod && k === 'f') { rf.fitView({ padding: 0.18, duration: reduced ? 0 : 300, maxZoom: 1 }); return }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [save, openSearch, search, ed, rf, reduced])

  const nodeColor = useCallback((n: WfNodeT) => (n.type === 'wfgroup' ? 'transparent' : findEntry(n.data.ref, community)?.color ?? '#8a8f98'), [community])
  const evalCount = nodes.filter((n) => n.data.kind === 'eval').length
  const runnable = nodes.filter((n) => n.data.kind === 'eval' && isRunnable(findEntry(n.data.ref, community))).length

  return (
    <div data-stage="basic" data-reduced={reduced} className="flex h-full flex-col bg-paper text-ink">
      {/* Top bar */}
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-chrome px-3 text-chrome-ink">
        <button onClick={() => navigate('start')} title="Home: choose guided or customize" aria-label="Tower Design Toolkit home" className="flex items-center gap-2 rounded-md px-1.5 py-1 outline-none hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-accent">
          <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden><rect x="7" y="2" width="6" height="16" rx="1" fill="currentColor" /><rect x="3" y="11" width="14" height="7" rx="1" fill="currentColor" opacity=".35" /></svg>
          <span className="hidden whitespace-nowrap text-sm font-semibold tracking-tight 2xl:inline">Tower Design Toolkit</span>
        </button>
        <span className="flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-semibold text-accent"><Workflow size={13} aria-hidden />Customize</span>
        <input value={name} onChange={(e) => ed().setMeta({ name: e.target.value })} aria-label="Workflow name"
          className="w-32 min-w-0 rounded-md border border-transparent bg-transparent px-2 py-1 text-sm font-medium xl:w-56 outline-none hover:border-line focus:border-accent focus:bg-panel" />
        {dirty && <span className="text-[10px] text-muted" title="Changes since the last save (the canvas itself is kept automatically)">unsaved</span>}
        <div role="tablist" aria-label="Project" className="ml-1 hidden rounded-md bg-black/5 p-0.5 md:flex">
          {PROJECTS.map((p) => (
            <button key={p.id} role="tab" aria-selected={project === p.id} onClick={() => setProject(p.id)}
              className={`whitespace-nowrap rounded px-2 py-0.5 text-[11px] font-medium ${project === p.id ? 'bg-white text-ink shadow-sm' : 'opacity-70 hover:opacity-100'}`}>{p.label}</button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-0.5">
          <Menu label="New" icon={<FilePlus2 size={15} aria-hidden />} open={menu === 'new'} setOpen={(o) => setMenu(o ? 'new' : null)}>
            {TEMPLATES.map((t) => (
              <button key={t.id} role="menuitem" onClick={() => { ed().load(t.make(Object.keys(enabled).filter((k) => enabled[k]))); setMenu(null); setFit((x) => x + 1) }}
                className="block w-full rounded-md px-2.5 py-1.5 text-left hover:bg-black/5"><span className="block text-xs font-medium">{t.name}</span><span className="block text-[10.5px] text-muted">{t.hint}</span></button>
            ))}
            <p className="border-t border-line px-2.5 pt-1.5 text-[10px] text-muted">Starting new replaces the canvas; Ctrl+Z will not bring it back, so save first.</p>
          </Menu>
          <Menu label="Open" icon={<FolderOpen size={15} aria-hidden />} open={menu === 'open'} setOpen={(o) => { setMenu(o ? 'open' : null); if (o) setSaved(listWorkflows(kv)) }}>
            {!kv && <p className="px-2.5 py-2 text-[11px] text-muted">Browser storage is off here. Use Import instead.</p>}
            {kv && !saved.length && <p className="px-2.5 py-2 text-[11px] text-muted">No saved workflows yet. Save one with Ctrl+S.</p>}
            {saved.map((s) => (
              <div key={s.id} className="flex items-center gap-1 rounded-md hover:bg-black/5">
                <button role="menuitem" onClick={() => { const wf = loadWorkflow(kv, s.id); if (wf) { ed().load(wf); setFit((x) => x + 1) } else ed().say('That saved workflow could not be read.'); setMenu(null) }}
                  className="min-w-0 flex-1 px-2.5 py-1.5 text-left"><span className="block truncate text-xs font-medium">{s.name}</span><span className="block text-[10.5px] text-muted">{s.nodes} nodes · {new Date(s.updatedAt).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' })}</span></button>
                <button aria-label={`Delete ${s.name}`} title="Delete from this browser" onClick={() => { if (window.confirm(`Delete the saved workflow "${s.name}" from this browser?`)) { deleteWorkflow(kv, s.id); setSaved(listWorkflows(kv)) } }}
                  className="mr-1 rounded p-1 text-muted hover:text-red-700"><Trash size={13} /></button>
              </div>
            ))}
          </Menu>
          <button onClick={save} title="Save in this browser (Ctrl+S)" aria-label="Save" className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs outline-none hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-accent"><Save size={15} aria-hidden /><span className="hidden xl:inline">Save</span></button>
          <button onClick={() => fileInput.current?.click()} title="Import a workflow JSON file" aria-label="Import workflow" className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs outline-none hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-accent"><Upload size={15} aria-hidden /><span className="hidden xl:inline">Import</span></button>
          <button onClick={exportJson} title="Export this workflow as a JSON file" aria-label="Export workflow" className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs outline-none hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-accent"><Download size={15} aria-hidden /><span className="hidden xl:inline">Export</span></button>
          <input ref={fileInput} type="file" accept=".json,application/json" className="hidden" aria-hidden tabIndex={-1} onChange={(e) => { importFile(e.target.files?.[0]); e.target.value = '' }} />
          <button onClick={() => setCommunityOpen(true)} aria-label="Community nodes" title="Community: browse, install and share nodes" className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs outline-none hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-accent"><Users size={15} aria-hidden /><span className="hidden xl:inline">Community</span></button>
          <button onClick={() => navigate('options')} aria-label="Design options" title="Design options: compare saved versions of the design by node and jury criterion" className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs outline-none hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-accent"><Scale size={15} aria-hidden /><span className="hidden xl:inline">Options</span></button>
          <span className="mx-1 h-5 w-px bg-line" aria-hidden />
          <button onClick={runInGuided} aria-label="Run in guided app" title={`Switch on exactly this workflow's ${runnable} runnable checks in the guided app`}
            className="flex items-center gap-1.5 whitespace-nowrap rounded-md bg-accent px-2.5 py-1.5 text-xs font-medium text-white outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2">
            <Play size={14} aria-hidden /><span className="hidden xl:inline">Run in guided app</span><span className="xl:hidden">Run</span>
          </button>
          <button onClick={() => navigate('guided')} title="Back to the guided process" aria-label="Guided process" className="flex items-center gap-1.5 whitespace-nowrap rounded-md border border-line px-2.5 py-1.5 text-xs font-medium outline-none hover:border-accent focus-visible:ring-2 focus-visible:ring-accent">
            <RouteIcon size={14} aria-hidden /><span className="hidden lg:inline">Guided process</span>
          </button>
        </div>
      </header>

      <Ribbon tab={tab} setTab={setTab} onAdd={(e) => add(e)} onSearch={() => openSearch()} community={community} onNodeBuilder={openNodeBuilder} onBrowse={() => setCommunityOpen(true)} />

      <div className="flex min-h-0 flex-1">
        <div ref={wrap} className="relative min-w-0 flex-1" onDragOver={(e) => { if (e.dataTransfer.types.includes(DRAG_MIME)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' } }} onDrop={onDrop} onDoubleClick={onDoubleClick}
          aria-label="Workflow canvas">
          <CommunityContext.Provider value={community}>
            <OutputsContext.Provider value={outputs}>
              <ReactFlow<WfNodeT, Edge>
                nodes={nodes} edges={edges} nodeTypes={nodeTypes}
                onNodesChange={(c) => ed().onNodesChange(c)} onEdgesChange={(c) => ed().onEdgesChange(c)}
                onConnect={(c) => ed().connect(c)} isValidConnection={isValidConnection} onConnectEnd={onConnectEnd}
                onBeforeDelete={onBeforeDelete} onNodeDragStart={() => ed().snapshot()} onMoveEnd={(_, vp) => useEditor.setState({ viewport: vp })}
                deleteKeyCode={['Delete', 'Backspace']} multiSelectionKeyCode={['Control', 'Meta', 'Shift']}
                // Grasshopper navigation: left-drag on the canvas box-selects; right or middle drag (or Space + drag) pans.
                selectionOnDrag panOnDrag={[1, 2]} selectionMode={SelectionMode.Partial} onPaneContextMenu={(e) => e.preventDefault()}
                zoomOnDoubleClick={false} minZoom={0.15} maxZoom={2} connectionRadius={28}
                connectionLineStyle={{ stroke: '#2a9d8f', strokeWidth: 2 }}
                defaultEdgeOptions={{ interactionWidth: 18 }}
                ariaLabelConfig={{ 'node.a11yDescription.default': 'Press Enter to select this node, arrow keys to move it, Delete to remove it.' }}
              >
                <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} color="#cfccc4" />
                <MiniMap<WfNodeT> pannable zoomable nodeColor={nodeColor} nodeStrokeWidth={2} maskColor="rgba(246,245,242,0.7)" ariaLabel="Mini map" style={{ width: 168, height: 112 }} className="!hidden !rounded-md !border !border-line xl:!block" />
                <Controls showInteractive={false} />
                {!nodes.length && (
                  <Panel position="top-center">
                    <div className="mt-16 w-[380px] rounded-xl border border-line bg-panel p-5 text-center shadow-lg">
                      <Workflow size={26} className="mx-auto text-accent" aria-hidden />
                      <h2 className="mt-2 text-sm font-semibold">An empty canvas</h2>
                      <p className="mt-1 text-xs text-muted">Drag icons from the ribbon above, double-click here, or press <kbd className="rounded border border-line px-1 font-mono">/</kbd> to find a node. Or start from a template:</p>
                      <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                        {TEMPLATES.filter((t) => t.id !== 'blank').map((t) => <button key={t.id} onClick={() => { ed().load(t.make(Object.keys(enabled).filter((k) => enabled[k]))); setFit((x) => x + 1) }} className="rounded-full border border-line px-2.5 py-1 text-[11px] hover:border-accent hover:text-accent">{t.name}</button>)}
                      </div>
                    </div>
                  </Panel>
                )}
              </ReactFlow>
            </OutputsContext.Provider>
          </CommunityContext.Provider>
          {!inspector && (
            <button onClick={() => setInspector(true)} className="absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-md border border-line bg-panel px-2 py-1 text-[11px] shadow-sm hover:border-accent" aria-label="Show details panel">
              <PanelRightOpen size={14} aria-hidden />Details
            </button>
          )}
        </div>
        {inspector && <WfInspector outputs={outputs} onClose={() => setInspector(false)} />}
      </div>

      <footer className="flex h-7 shrink-0 items-center gap-3 border-t border-line bg-chrome px-3 text-[11px] text-muted">
        <span aria-live="polite" className={`min-w-0 flex-1 truncate ${message.startsWith("Can't") || message.startsWith('Could not') ? 'text-amber-800' : ''}`}>{message || 'Double-click or / to find a node · drag to select · right-drag to pan · F to fit'}</span>
        <span className="whitespace-nowrap">{nodes.filter((n) => n.type !== 'wfgroup').length} nodes · {edges.length} wires · {runnable}/{evalCount} checks runnable</span>
      </footer>

      {search && (
        <QuickSearch at={search} entries={entries} onClose={() => setSearch(null)}
          onPick={(e) => { const p = rf.screenToFlowPosition({ x: search.x + 20, y: search.y + 20 }); add(e, p); setSearch(null) }} />
      )}
      {/* The node builder dialog lives in the guided app too; only one of the two pages is mounted at a time. */}
      <NodeBuilderHost />
      <CommunityDrawer open={communityOpen} onClose={() => setCommunityOpen(false)}
        onAddToCanvas={(id) => { const e = entries.find((x) => x.ref === id); if (e) { add(e); setTab('MINE') } }} />
    </div>
  )
}

export default function Customize() {
  return (
    <ReactFlowProvider>
      <Builder />
    </ReactFlowProvider>
  )
}
