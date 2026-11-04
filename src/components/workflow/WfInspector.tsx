// Right panel of the builder: the selected node's question, live lines with sources and flags, and its settings.
import { Copy, ExternalLink, FlaskConical, Keyboard, PanelRightClose, Plus, Trash, Ungroup, Power, PowerOff } from 'lucide-react'
import { useReactFlow } from '@xyflow/react'
import type { ReactNode } from 'react'
import { CATEGORIES, JURY_LABEL } from '../../data/registry'
import type { Flag } from '../../engine/types'
import { PORT_COLOR, PORT_LABEL, type Item, type NodeOutput, type PortType } from '../../lib/workflowLogic'
import { useStore, useTowers } from '../../store'
import { FlagChip, Kbd } from '../ui'
import { findEntry, STATUS_LABEL, type Entry } from './catalog'
import { useCommunityNodes } from './community'
import { GROUP_COLORS, useEditor, type WfNodeT } from './editorStore'
import { StateWord } from './WfNodes'

function Block({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="border-b border-line px-4 py-3">
      <div className="mb-1.5 flex items-center justify-between"><h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted">{title}</h3>{right}</div>
      {children}
    </section>
  )
}

export function ItemList({ items }: { items: Item[] }) {
  if (!items.length) return <p className="text-[11px] text-muted">No result lines yet.</p>
  return (
    <ul className="space-y-1.5">
      {items.map((i) => (
        <li key={`${i.from ?? ''}${i.id}`} className={`rounded-md border p-2 ${i.flag === 'false_assumption' ? 'border-flag-false/50' : 'border-line'}`}>
          <div className="flex items-start justify-between gap-2">
            <span className="text-[11.5px] font-medium leading-snug">{i.label}{i.towerName && <span className="font-normal text-muted"> · {i.towerName}</span>}</span>
            <StateWord state={i.state} />
          </div>
          {i.value && <div className="mt-0.5 text-[11px] tabular-nums">{i.value}{i.threshold && <span className="text-muted"> · {i.threshold}</span>}</div>}
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <FlagChip flag={i.flag} />
            {i.source && (
              <span className="text-[10px] text-muted">
                {i.source.url ? <a href={i.source.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 hover:text-accent">{i.source.label}<ExternalLink size={9} aria-hidden /></a> : i.source.label}
                {i.source.page && ` · ${i.source.page}`}
              </span>
            )}
          </div>
          {i.from && <div className="mt-0.5 text-[10px] text-muted">from {i.from}</div>}
          {i.note && <div className={`mt-0.5 text-[10px] ${i.flag === 'false_assumption' ? 'text-flag-false' : 'text-muted'}`}>{i.note}</div>}
        </li>
      ))}
    </ul>
  )
}

const FLAGS: Flag[] = ['verified', 'team_assumption', 'unverified', 'unresolved', 'false_assumption']

function Overview() {
  const { name, description, nodes, edges, setMeta } = useEditor()
  const community = useCommunityNodes()
  const evals = nodes.filter((n) => n.data.kind === 'eval')
  const runnable = evals.filter((n) => { const e = findEntry(n.data.ref, community); return e && e.status !== 'researched' })
  return (
    <>
      <Block title="Workflow">
        <label className="block text-[11px] text-muted">Name
          <input value={name} onChange={(e) => setMeta({ name: e.target.value })} className="mt-0.5 w-full rounded border border-line bg-panel px-2 py-1 text-xs text-ink outline-none focus:border-accent" />
        </label>
        <label className="mt-2 block text-[11px] text-muted">What is it for?
          <textarea value={description} onChange={(e) => setMeta({ description: e.target.value })} rows={2} placeholder="e.g. Check views and lifts before the 13 Nov review"
            className="mt-0.5 w-full resize-none rounded border border-line bg-panel px-2 py-1 text-xs text-ink outline-none focus:border-accent" />
        </label>
        <p className="mt-1.5 text-[11px] text-muted">{nodes.filter((n) => n.type !== 'wfgroup').length} nodes · {edges.length} wires · {runnable.length} of {evals.length} checks runnable</p>
      </Block>
      <Block title="How to build" right={<Keyboard size={13} className="text-muted" aria-hidden />}>
        <ul className="space-y-1 text-[11px] text-ink/80">
          <li>Drag a tile from the ribbon, or <Kbd>/</Kbd> / double-click the canvas to search</li>
          <li>Wire an output dot to an input dot of the same colour</li>
          <li><Kbd>Del</Kbd> remove · <Kbd>Ctrl</Kbd><Kbd>Z</Kbd> undo · <Kbd>Ctrl</Kbd><Kbd>Y</Kbd> redo</li>
          <li><Kbd>Ctrl</Kbd><Kbd>G</Kbd> group selected · <Kbd>Ctrl</Kbd><Kbd>D</Kbd> duplicate · <Kbd>Ctrl</Kbd><Kbd>S</Kbd> save</li>
          <li>Drag on the empty canvas to box-select (<Kbd>Ctrl</Kbd><Kbd>A</Kbd> all); right-drag or <Kbd>Space</Kbd>-drag to pan; scroll to zoom; <Kbd>F</Kbd> fits the view</li>
        </ul>
      </Block>
      <Block title="Ports">
        <ul className="grid grid-cols-2 gap-1 text-[11px]">
          {(Object.keys(PORT_COLOR) as PortType[]).map((t) => <li key={t} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: PORT_COLOR[t] }} />{PORT_LABEL[t]}</li>)}
        </ul>
        <p className="mt-1.5 text-[10.5px] text-muted">Layer 0 sources feed checks; checks feed logic. Logic can feed more logic.</p>
      </Block>
      <Block title="Evidence">
        <div className="flex flex-wrap gap-1">{FLAGS.map((f) => <FlagChip key={f} flag={f} />)}</div>
        <p className="mt-1.5 text-[10.5px] text-muted">Logic nodes show the weakest flag of what flows in, so a false assumption upstream stays visible in magenta.</p>
      </Block>
    </>
  )
}

function ScoreSettings({ node }: { node: WfNodeT }) {
  const setParams = useEditor((s) => s.setParams)
  const nodes = useEditor((s) => s.nodes)
  const edges = useEditor((s) => s.edges)
  const p = node.data.params ?? {}
  const weights = (typeof p.weights === 'object' ? p.weights : {}) as Record<string, number>
  const ins = edges.filter((e) => e.target === node.id).map((e) => nodes.find((n) => n.id === e.source)).filter(Boolean) as WfNodeT[]
  const mark = (k: 'passMark' | 'failMark', label: string, d: number) => (
    <label className="flex items-center justify-between gap-2 text-[11px]">{label}
      <input type="number" min={0} max={100} value={typeof p[k] === 'number' ? (p[k] as number) : d} onChange={(e) => setParams(node.id, { [k]: Number(e.target.value) })}
        className="w-16 rounded border border-line bg-panel px-1.5 py-0.5 text-right tabular-nums outline-none focus:border-accent" aria-label={label} />
    </label>
  )
  return (
    <Block title="Weights" right={<FlagChip flag="team_assumption" />}>
      {!ins.length && <p className="text-[11px] text-muted">Wire checks into this node, then weigh them here.</p>}
      <ul className="space-y-1.5">
        {ins.map((n) => {
          const w = Number.isFinite(weights[n.id]) ? weights[n.id] : 1
          return (
            <li key={n.id} className="text-[11px]">
              <div className="flex items-center justify-between"><span className="truncate">{n.data.label}</span><span className="tabular-nums text-muted">× {w}</span></div>
              <input type="range" min={0} max={5} step={0.5} value={w} onChange={(e) => setParams(node.id, { weights: { ...weights, [n.id]: Number(e.target.value) } })}
                className="w-full accent-accent" aria-label={`Weight of ${n.data.label}`} />
            </li>
          )
        })}
      </ul>
      <div className="mt-2 space-y-1">{mark('passMark', 'Pass mark (0–100)', 70)}{mark('failMark', 'Fail below (0–100)', 40)}</div>
      <p className="mt-1.5 text-[10.5px] text-muted">Each check scores pass 1, check 0.5, fail 0; unknown is left out. Weights and marks are your team's choice, not a sourced standard.</p>
    </Block>
  )
}

function CompareSettings({ node }: { node: WfNodeT }) {
  const towers = useTowers()
  const addTower = useStore((s) => s.addTower)
  const setParams = useEditor((s) => s.setParams)
  const p = node.data.params ?? {}
  const pick = (k: 'a' | 'b', fallback: number) => (
    <label className="flex items-center justify-between gap-2 text-[11px]">Option {k.toUpperCase()}
      <select value={(p[k] as string) || towers[fallback]?.id || ''} onChange={(e) => setParams(node.id, { [k]: e.target.value })}
        className="rounded border border-line bg-panel px-1.5 py-0.5 text-[11px] outline-none focus:border-accent" aria-label={`Option ${k.toUpperCase()} tower`}>
        {towers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
    </label>
  )
  return (
    <Block title="Options" right={<FlagChip flag="team_assumption" />}>
      {towers.length < 2 ? (
        <>
          <p className="text-[11px] text-muted">Compare scores two towers of this project on the same checks. This project has one tower.</p>
          <button onClick={() => addTower()} className="mt-1.5 flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[11px] hover:border-accent"><Plus size={12} aria-hidden />Add a second tower as option B</button>
        </>
      ) : <div className="space-y-1">{pick('a', 0)}{pick('b', 1)}</div>}
      <p className="mt-1.5 text-[10.5px] text-muted">Tower-specific lines go to their tower; project-wide lines (such as FSR) count for both. Edit the towers in the guided app.</p>
    </Block>
  )
}

function Researched({ e }: { e: Entry }) {
  const d = e.def!
  return (
    <>
      <Block title="Status"><p className="flex items-start gap-1.5 text-[11px] text-ink/80"><FlaskConical size={13} className="mt-0.5 shrink-0" aria-hidden />Researched, not runnable. On the canvas it is a placeholder: it passes "unknown" to logic nodes, so nothing reads as a pass by accident.</p></Block>
      {d.method && <Block title="Method (planned)"><p className="text-[11px] leading-relaxed text-ink/80">{d.method}</p></Block>}
      {d.metrics?.length ? (
        <Block title="Metrics">
          <ul className="space-y-1.5">{d.metrics.map((m) => <li key={m.name} className="text-[11px]"><div className="flex items-center justify-between gap-2"><span className="font-medium">{m.name}</span><FlagChip flag={m.status} /></div><div className="text-[10.5px] text-muted">good {m.good} · bad {m.bad} {m.unit && `(${m.unit})`}</div></li>)}</ul>
        </Block>
      ) : null}
      {d.human && <Block title="Stays a human judgement"><p className="text-[11px] text-ink/80">{d.human}</p></Block>}
      {d.limits && <Block title="Limits"><p className="text-[11px] text-ink/80">{d.limits}</p></Block>}
    </>
  )
}

export default function WfInspector({ outputs, onClose }: { outputs: Record<string, NodeOutput>; onClose: () => void }) {
  const nodes = useEditor((s) => s.nodes)
  const { updateData, ungroup, duplicateSelected } = useEditor()
  const { deleteElements } = useReactFlow()
  const community = useCommunityNodes()
  const selected = nodes.filter((n) => n.selected)
  const node = selected.length === 1 ? selected[0] : null
  const entry = node ? findEntry(node.data.ref, community) : null
  const out = node ? outputs[node.id] : undefined

  return (
    <aside aria-label="Node details" className="flex w-80 shrink-0 flex-col border-l border-line bg-panel">
      <div className="flex h-10 items-center justify-between border-b border-line px-4">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">{node ? 'Node' : selected.length > 1 ? `${selected.length} selected` : 'Workflow'}</span>
        <button onClick={onClose} aria-label="Hide details panel" title="Hide details" className="rounded p-1 text-muted hover:bg-black/5 hover:text-ink"><PanelRightClose size={15} /></button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!node && selected.length > 1 && (
          <Block title="Selection"><p className="text-[11px] text-muted">Press <Kbd>Ctrl</Kbd><Kbd>G</Kbd> to group these, <Kbd>Ctrl</Kbd><Kbd>D</Kbd> to duplicate, or <Kbd>Del</Kbd> to remove.</p></Block>
        )}
        {!node && selected.length <= 1 && <Overview />}
        {node && node.type === 'wfgroup' && (
          <Block title="Group">
            <input value={node.data.label} onChange={(e) => updateData(node.id, { label: e.target.value })} aria-label="Group name" className="w-full rounded border border-line px-2 py-1 text-xs outline-none focus:border-accent" />
            <div className="mt-2 flex gap-1.5" role="radiogroup" aria-label="Group colour">
              {GROUP_COLORS.map((c) => <button key={c} role="radio" aria-checked={node.data.color === c} aria-label={`Colour ${c}`} onClick={() => updateData(node.id, { color: c })} className={`h-5 w-5 rounded-full ${node.data.color === c ? 'ring-2 ring-ink ring-offset-1' : ''}`} style={{ background: c }} />)}
            </div>
            <p className="mt-2 text-[11px] text-muted">{nodes.filter((n) => n.parentId === node.id).length} nodes inside. Drag the frame to move them together; drag its corner to resize.</p>
            <button onClick={() => ungroup(node.id)} className="mt-2 flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[11px] hover:border-accent"><Ungroup size={12} aria-hidden />Ungroup (keep the nodes)</button>
          </Block>
        )}
        {node && node.type !== 'wfgroup' && (
          <>
            <Block title={entry ? STATUS_LABEL[entry.status] : 'Missing node'}>
              <div className="flex items-start gap-2.5">
                {entry && <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${entry.status === 'researched' ? 'border border-dashed border-slate-400 text-slate-500' : 'text-white'}`} style={entry.status === 'researched' ? undefined : { background: entry.color }}><entry.icon size={18} aria-hidden /></span>}
                <div className="min-w-0 flex-1">
                  <input value={node.data.label} onChange={(e) => updateData(node.id, { label: e.target.value })} aria-label="Node label"
                    className="w-full rounded border border-transparent px-1 py-0.5 text-sm font-semibold outline-none hover:border-line focus:border-accent" />
                  <div className="px-1 text-[10.5px] text-muted">{entry?.category ? CATEGORIES[entry.category].label : entry?.status === 'logic' ? 'Workflow logic' : 'Layer 0'} · <span className="font-mono">{node.data.ref}</span></div>
                </div>
              </div>
              <p className="mt-2 text-[11.5px] leading-relaxed text-ink/80">{entry?.def?.question ?? entry?.blurb ?? 'This node is not in the library on this computer. Import its package under My nodes.'}</p>
              {entry?.def?.jury?.length ? <div className="mt-1.5 flex flex-wrap gap-1">{entry.def.jury.map((j) => <span key={j} className="rounded-full border border-line px-1.5 py-0.5 text-[10px] text-muted">{JURY_LABEL[j] ?? j}</span>)}</div> : null}
              <div className="mt-2 flex gap-1.5">
                <button onClick={() => duplicateSelected()} className="flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[11px] hover:border-accent"><Copy size={12} aria-hidden />Duplicate</button>
                <button onClick={() => deleteElements({ nodes: [{ id: node.id }] })} className="flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[11px] hover:border-red-400 hover:text-red-700"><Trash size={12} aria-hidden />Remove</button>
                {node.data.kind !== 'source' && (
                  <button onClick={() => updateData(node.id, { off: !node.data.off })} aria-pressed={!!node.data.off}
                    title={node.data.off ? 'Switch this node back on' : 'Switch this node off: it gives no verdict and the checks after it are blocked (never computed on missing data)'}
                    className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] ${node.data.off ? 'border-amber-500 bg-amber-50 text-amber-900' : 'border-line hover:border-accent'}`}>
                    {node.data.off ? <><Power size={12} aria-hidden />Switch on</> : <><PowerOff size={12} aria-hidden />Switch off</>}
                  </button>
                )}
              </div>
            </Block>
            {node.data.ref === 'logic.score' && <ScoreSettings node={node} />}
            {node.data.ref === 'logic.compare' && <CompareSettings node={node} />}
            {entry?.status === 'researched' ? <Researched e={entry} /> : out && node.data.kind !== 'source' && (
              <Block title={out.run?.status === 'waiting' ? 'Not run yet' : out.run ? 'Run status' : 'Live result'} right={out.run ? <span className="text-[11px] font-semibold uppercase tracking-wide text-amber-800">{out.run.status === 'off' ? 'Off' : out.run.status === 'blocked' ? 'Blocked' : 'Waiting'}</span> : <StateWord state={out.state} />}>
                <p className="mb-2 text-[11.5px]">{out.headline}</p>
                {out.ms !== undefined && !out.run && <p className="-mt-1 mb-2 text-[11px] text-muted">Computed in {out.ms < 1 ? 'under 1' : out.ms.toFixed(0)} ms</p>}
                {out.breakdown && node.data.ref === 'logic.score' && (
                  <ul className="mb-2 space-y-0.5 text-[10.5px] text-muted">{out.breakdown.map((b) => <li key={b.id} className="flex justify-between gap-2"><span className="truncate">{b.label} × {b.weight}</span><span className="tabular-nums">{Number.isFinite(b.score) ? `${Math.round(b.score * 100)} / 100` : 'not scored'} ({b.scored} scored{b.unscored ? `, ${b.unscored} unknown` : ''})</span></li>)}</ul>
                )}
                <ItemList items={out.items} />
              </Block>
            )}
            {node.data.kind === 'source' && out && <Block title="Carries"><p className="text-[11.5px]">{out.headline}</p><p className="mt-1 text-[10.5px] text-muted">Edit the design itself in the guided app (Massing and Schematic). Every check on this canvas reads the same design.</p></Block>}
            {entry?.def?.limits && entry.status !== 'researched' && <Block title="Limits"><p className="text-[11px] text-ink/80">{entry.def.limits}</p></Block>}
          </>
        )}
      </div>
    </aside>
  )
}
