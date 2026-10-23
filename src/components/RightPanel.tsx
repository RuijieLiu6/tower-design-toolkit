import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import DesignPanel from './DesignPanel'
import Inspector from './Inspector'
import PresentPanel from './PresentPanel'
import TracePanel from './TracePanel'

type Tab = 'design' | 'results' | 'present' | 'trace'

export default function RightPanel() {
  const phase = useStore((s) => s.phase)
  const selectedNode = useStore((s) => s.selectedNode)
  const [tab, setTab] = useState<Tab>('design')
  useEffect(() => { setTab(phase === 'present' ? 'present' : 'design') }, [phase])
  // Picking a node shows its results; switching phase alone does not.
  const first = useRef(true)
  useEffect(() => {
    if (first.current) { first.current = false; return }
    if (selectedNode) setTab('results')
  }, [selectedNode])
  const tabs: { id: Tab; label: string }[] = phase === 'present'
    ? [{ id: 'present', label: 'Present' }, { id: 'results', label: 'Results & evidence' }, { id: 'trace', label: 'Trace' }]
    : [{ id: 'design', label: 'Design' }, { id: 'results', label: 'Results & evidence' }, { id: 'trace', label: 'Trace' }]
  return (
    <aside className="flex h-full w-[22rem] shrink-0 flex-col border-l border-line bg-panel" aria-label="Design and results">
      <div role="tablist" className="flex border-b border-line">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={`flex-1 px-3 py-2.5 text-xs font-medium ${tab === t.id ? 'border-b-2 border-accent text-ink' : 'text-muted hover:text-ink'}`}>{t.label}</button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        {tab === 'design' && <DesignPanel />}
        {tab === 'results' && <Inspector />}
        {tab === 'present' && <PresentPanel />}
        {tab === 'trace' && <TracePanel />}
      </div>
    </aside>
  )
}
