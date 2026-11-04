import { Background, Controls, Handle, Position, ReactFlow, type Edge, type Node, type NodeProps } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useMemo } from 'react'
import { Box } from 'lucide-react'
import { CATEGORY_ICONS } from '../data/icons'
import { BUILT_NODES, CATEGORIES, nodeById, type Category } from '../data/registry'
import { STATE_LABEL } from '../engine/viewCones'
import { useCommunityResults } from '../hooks/useCommunityResults'
import { useEconomics } from '../hooks/useEconomics'
import { useMobility } from '../hooks/useMobility'
import { useFacade } from '../hooks/useFacade'
import { useEnergyCarbon } from '../hooks/useEnergyCarbon'
import { useWindScreen } from '../hooks/useWindScreen'
import { useTrips } from '../hooks/useTrips'
import { useCultureGate } from './CultureResults'
import { useProvenanceIssues } from './ProvenanceResults'
import { money, VERDICT_LABEL } from '../engine/economics'
import { useResults } from '../hooks/useResults'
import { useCommunityStore } from '../lib/communityStore'
import { toCustomize } from '../lib/interchange/converters'
import { useStore, useTowers } from '../store'
import { interiorCheck } from '../engine/interior'
import { towerFloors } from '../engine/massing'
import { communityCanvas } from './communityCanvas'
import { useShallow } from 'zustand/react/shallow'

type CardData = { title: string; category: Category | 'L0'; subtitle: string; status?: string; tone?: 'ok' | 'warn' | 'bad' | 'muted'; inputs?: boolean; outputs?: boolean }

const TONE: Record<string, string> = { ok: 'text-emerald-700', warn: 'text-amber-700', bad: 'text-red-700', muted: 'text-slate-500' }

function Card({ data, selected }: NodeProps<Node<CardData>>) {
  const color = data.category === 'L0' ? '#1f2328' : CATEGORIES[data.category].color
  const Icon = data.category === 'L0' ? Box : CATEGORY_ICONS[data.category]
  return (
    <div className={`w-52 rounded-md border bg-panel shadow-sm ${selected ? 'border-accent ring-2 ring-accent/30' : 'border-line'}`}>
      {data.inputs && <Handle type="target" position={Position.Left} className="!h-3 !w-3 !border-2 !border-white !bg-slate-400" />}
      <div className="h-1 rounded-t-md" style={{ background: color }} />
      <div className="px-2.5 py-2">
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-white" style={{ background: color }}><Icon size={12} /></span><span className="truncate text-xs font-semibold">{data.title}</span></span>
          <span className="font-mono text-[9px] text-muted">{data.category === 'L0' ? 'LAYER 0' : data.category}</span>
        </div>
        <div className="mt-0.5 text-[10px] text-muted">{data.subtitle}</div>
        {data.status && <div className={`mt-1 text-[11px] font-medium ${TONE[data.tone ?? 'muted']}`}>{data.status}</div>}
      </div>
      {data.outputs && <Handle type="source" position={Position.Right} className="!h-3 !w-3 !border-2 !border-white !bg-accent" />}
    </div>
  )
}

const nodeTypes = { card: Card }

export default function NodeCanvas() {
  const { enabled, project, selectedNode, selectNode } = useStore(useShallow((s) => ({ enabled: s.enabled, project: s.project, selectedNode: s.selectedNode, selectNode: s.selectNode })))
  const { rules, fsr, cones, lifts, egress, skyRooms, streetwall, frontage, groundPlane } = useResults()
  const community = useCommunityResults()
  const econ = useEconomics().result
  const mobility = useMobility()
  const facade = useFacade()
  const energy = useEnergyCarbon()
  const windScreen = useWindScreen()
  const trips = useTrips()
  const towers = useTowers()
  const selectedTower = useStore((s) => s.selectedTower)
  const culture = useCultureGate()
  const provenance = useProvenanceIssues()
  const model = useStore((s) => s.models[s.project])
  const packages = useCommunityStore((s) => s.packages)

  const { nodes, edges } = useMemo(() => {
    const l0: Node<CardData>[] = [
      { id: 'l0.site', type: 'card', position: { x: 0, y: 0 }, data: { title: 'Site & context', category: 'L0', subtitle: project === 'vtc' ? 'VTC block · supplied context' : 'Downtown · City view cones', outputs: true } },
      { id: 'l0.massing', type: 'card', position: { x: 0, y: 120 }, data: { title: 'Massing', category: 'L0', subtitle: model ? `From ${model.source.fileName}` : 'Towers, podium, floors', outputs: true } },
      { id: 'l0.program', type: 'card', position: { x: 0, y: 240 }, data: { title: 'Program', category: 'L0', subtitle: 'Uses by floor band', outputs: true } },
    ]
    const evals: Node<CardData>[] = []
    const e: Edge[] = []
    const active = BUILT_NODES.filter((n) => enabled[n.id] && (!n.projects || n.projects.includes(project)))
    active.forEach((n, i) => {
      let status = '', tone: CardData['tone'] = 'muted'
      if (n.id === 'built.vtc-rules') {
        const fails = rules.filter((r) => r.state === 'fail').length, warns = rules.filter((r) => r.state === 'warn').length
        status = fails ? `${fails} fail · ${warns} check` : warns ? `${warns} to check` : 'All rules pass'
        tone = fails ? 'bad' : warns ? 'warn' : 'ok'
      } else if (n.id === 'built.fsr') {
        status = `Total FSR ${fsr.totalFsr.toFixed(2)} · non-res ${fsr.tier2.toFixed(2)}`; tone = fsr.tier2 >= 9 ? 'ok' : 'warn'
      } else if (n.id === 'built.viewcones') {
        const o = cones[0]?.overall
        status = o ? STATE_LABEL[o] : '—'; tone = o === 'above' ? 'bad' : o === 'limit_unknown' || o === 'within_uncertainty' ? 'warn' : 'ok'
      } else if (n.id === 'built.sun') { status = 'Preview (not the City test)'; tone = 'muted'
      } else if (n.id === 'built.core-lifts') {
        const cars = lifts.reduce((s, l) => s + l.totalCars, 0), rises = lifts.reduce((s, l) => s + l.rises.length, 0)
        const short = Math.max(0, ...lifts.map((l) => l.requiredMax - l.modelledCore))
        const bad = lifts.some((l) => l.rules.some((r) => r.state === 'fail')), warn = lifts.some((l) => l.rules.some((r) => r.state === 'warn'))
        const sky = lifts.reduce((s, l) => s + l.skyLobbies.length, 0)
        status = `${cars} cars in ${rises} groups${sky ? ` · ${sky} sky lobb${sky > 1 ? 'ies' : 'y'}` : ''} · ${short > 0.5 ? `core short by ${Math.round(short)} m²` : 'core fits'}`
        tone = bad ? 'bad' : warn ? 'warn' : 'ok'
      } else if (n.id === 'built.egress') {
        const w = Math.max(0, ...egress.map((e) => e.widthMm))
        const fails = egress.reduce((s, e) => s + e.rules.filter((r) => r.state === 'fail').length, 0), warns = egress.reduce((s, e) => s + e.rules.filter((r) => r.state === 'warn').length, 0)
        status = `${egress[0]?.stairs ?? 2} stairs × ${Math.round(w)} mm${fails ? ` · ${fails} fail` : warns ? ` · ${warns} to check` : ' · all pass'}`
        tone = fails ? 'bad' : warns ? 'warn' : 'ok'
      } else if (n.id === 'built.sky-room') {
        const room = skyRooms.find((r) => r.room)
        const fails = skyRooms.reduce((s, r) => s + r.rules.filter((x) => x.state === 'fail').length, 0), warns = skyRooms.reduce((s, r) => s + r.rules.filter((x) => x.state === 'warn').length, 0)
        status = room ? `Level ${room.room!.level} · about ${Math.round(room.visitorsPerHour)} visitors/h${fails ? ` · ${fails} fail` : warns ? ` · ${warns} to check` : ''}` : 'No public room yet'
        tone = !room ? 'warn' : fails ? 'bad' : warns ? 'warn' : 'ok'
      } else if (n.id === 'built.culture-claims') {
        const done = culture.gate.filter((g) => g.ok).length, bad = culture.findings.filter((f) => !f.pass).length
        status = `${done} of ${culture.gate.length} export checks${bad ? ` · ${bad} claim${bad > 1 ? 's' : ''} above status` : ''}`
        tone = bad ? 'bad' : done === culture.gate.length ? 'ok' : 'warn'
      } else if (n.id === 'built.model') {
        const out = toCustomize(model, towers)
        status = out.headline
        tone = out.state === 'idle' ? 'muted' : out.state === 'fail' ? 'bad' : out.state === 'warn' ? 'warn' : 'ok'
      } else if (n.id === 'built.provenance') {
        status = provenance.prov.length ? `${provenance.prov.length} elements · ${provenance.issues.length ? `${provenance.issues.length} to fix` : 'complete'}` : 'No elements logged yet'
        tone = !provenance.prov.length ? 'muted' : provenance.issues.length ? 'warn' : 'ok'
      } else if (n.id === 'built.interior') {
        const t = towers.find((x) => x.id === selectedTower) ?? towers[0]
        const r = t ? interiorCheck(t, towerFloors(t)) : null
        status = !r ? '—' : !r.on ? 'Layout off: area proxies in use' : `${r.totals.homes.toLocaleString('en-CA')} homes · ${r.totals.keys} keys from the layout`
        tone = !r ? 'muted' : r.on ? 'ok' : 'warn'
      } else if (n.id === 'built.facade') {
        const bird = facade.rules.find((r) => r.id === 'fa-bird')
        status = `WWR ${facade.wall ? Math.round((facade.glass / facade.wall) * 100) : 0}% · bird zone ${bird?.state === 'pass' ? 'treated' : bird?.state === 'unknown' ? 'not entered' : 'under 90%'}`
        tone = bird?.state === 'fail' ? 'bad' : bird?.state === 'pass' ? 'ok' : 'warn'
      } else if (n.id === 'built.mobility') {
        const fails = mobility.rules.filter((r) => r.state === 'fail').length, open = mobility.rules.filter((r) => r.flag === 'unresolved').length
        status = `Max ${mobility.maxStalls} stalls (unverified)${fails ? ` · ${fails} fail` : ''} · ${open} rates unresolved`
        tone = fails ? 'bad' : 'warn'
      } else if (n.id === 'built.energy-carbon') {
        const all = energy ? [...energy.operational, ...energy.carbon] : []
        const fails = all.filter((r) => r.state === 'fail').length, warns = all.filter((r) => r.state === 'warn').length
        status = energy ? `GHGI ${energy.net.ghgi.toFixed(2)} / ${energy.limits.effective.ghgi.toFixed(2)} · ${Math.round(energy.embodied.band[1])} kgCO₂e/m²${fails ? ` · ${fails} fail` : warns ? ` · ${warns} to check` : ''}` : '—'
        tone = !energy ? 'muted' : fails ? 'bad' : warns ? 'warn' : 'ok'
      } else if (n.id === 'built.wind-screen') {
        const highs = windScreen ? windScreen.towers.flatMap((t) => t.sectors).filter((s) => s.base === 'high' || s.corner === 'high').length : 0
        status = windScreen ? `${windScreen.study.required ? 'Wind study required' : 'Study not triggered everywhere'} · ${highs ? `${highs} high-risk direction${highs > 1 ? 's' : ''}` : 'no high-risk direction'} · screening` : '—'
        tone = !windScreen ? 'muted' : highs || windScreen.study.required ? 'warn' : 'ok'
      } else if (n.id === 'built.trips') {
        status = trips ? `${Math.round(trips.am.in).toLocaleString('en-CA')} AM arrivals · link ${trips.station.required.toFixed(1)} m needed (comfort only)` : '—'
        tone = !trips ? 'muted' : trips.station.ratio > 1 ? 'warn' : 'muted'
      } else if (n.id === 'built.economics') {
        status = `${VERDICT_LABEL[econ.verdict]} · land residual ${money(econ.rlvAfter)}`
        tone = econ.verdict === 'works' ? 'ok' : econ.verdict === 'marginal' ? 'warn' : econ.verdict === 'fails' ? 'bad' : 'muted'
      } else if (n.id.startsWith('built.pr-')) {
        const res = n.id === 'built.pr-streetwall' ? streetwall : n.id === 'built.pr-frontage' ? frontage : groundPlane
        const fails = res ? res.rules.filter((r) => r.state === 'fail').length : 0, warns = res ? res.rules.filter((r) => r.state === 'warn').length : 0
        status = !res ? '—' : fails ? `${fails} fail · ${warns} to check` : warns ? `${warns} to check` : 'All pass'
        tone = !res ? 'muted' : fails ? 'bad' : warns ? 'warn' : 'ok'
      }
      evals.push({ id: n.id, type: 'card', position: { x: 320, y: i * 120 }, selected: selectedNode === n.id, data: { title: n.name, category: n.category, subtitle: n.status === 'preview' ? 'Built · preview' : 'Built · deterministic', status, tone, inputs: true, outputs: true } })
      const ins = n.id === 'built.fsr' || n.id === 'built.core-lifts' || n.id === 'built.egress' || n.id === 'built.sky-room' ? ['l0.program', 'l0.massing'] : n.id === 'built.sun' ? ['l0.site', 'l0.massing'] : ['l0.site', 'l0.massing', 'l0.program']
      ins.forEach((src) => e.push({ id: `${src}-${n.id}`, source: src, target: n.id, animated: false, style: { stroke: '#9aa3ad' } }))
      e.push({ id: `${n.id}-report`, source: n.id, target: 'report', style: { stroke: '#1f5f8b' } })
    })
    // Switched-on community nodes follow the built ones.
    const mine = communityCanvas(packages, community, enabled, active.length, selectedNode)
    evals.push(...mine.nodes)
    e.push(...mine.edges)
    const slots = active.length + mine.nodes.length
    const sel = nodeById(selectedNode)
    if (sel && sel.status === 'researched') {
      evals.push({ id: sel.id, type: 'card', position: { x: 320, y: slots * 120 }, selected: true, data: { title: sel.name, category: sel.category, subtitle: `Researched · ${sel.priority} · not built yet`, status: 'Preview of a future node', tone: 'muted', inputs: true } })
      e.push({ id: `l0.massing-${sel.id}`, source: 'l0.massing', target: sel.id, style: { stroke: '#cbd2d9', strokeDasharray: '4 4' } })
    }
    const report: Node<CardData> = { id: 'report', type: 'card', position: { x: 640, y: Math.max(0, (slots - 1) * 60) }, data: { title: 'Evidence report', category: 'PRES', subtitle: 'Results + sources + flags', inputs: true } }
    return { nodes: [...l0, ...evals, report], edges: e }
  }, [enabled, project, rules, fsr, cones, lifts, egress, skyRooms, streetwall, frontage, groundPlane, selectedNode, community, packages, econ, culture, provenance, mobility, energy, windScreen, trips, facade, towers, selectedTower, model])

  return (
    <div className="h-full w-full bg-paper" aria-label="Node canvas">
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.25 }} minZoom={0.3}
        onNodeClick={(_, n) => { if (!n.id.startsWith('l0.') && n.id !== 'report') selectNode(n.id) }} nodesConnectable={false} proOptions={{ hideAttribution: false }}>
        <Background gap={20} color="#dcdad4" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}
