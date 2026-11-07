// Quick search, like Grasshopper's double-click search: type, pick with the arrow keys, Enter drops the node there.
import { FlaskConical, Search } from '../icons'
import { useEffect, useMemo, useRef, useState } from 'react'
import { searchEntries, STATUS_LABEL, type Entry } from './catalog'

export default function QuickSearch({ at, entries, onPick, onClose }: {
  at: { x: number; y: number }; entries: Entry[]; onPick: (e: Entry) => void; onClose: () => void
}) {
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const list = useMemo(() => searchEntries(entries, q, 10), [entries, q])
  useEffect(() => { input.current?.focus() }, [])
  useEffect(() => setI(0), [q])

  // Keep the box on screen.
  const left = Math.min(at.x, window.innerWidth - 380), top = Math.min(at.y, window.innerHeight - 420)

  return (
    <div className="fixed inset-0 z-40" onMouseDown={onClose}>
      <div role="dialog" aria-label="Find a node" className="glass absolute w-[360px] overflow-hidden rounded-lg border border-line bg-panel shadow-xl" style={{ left: Math.max(8, left), top: Math.max(8, top) }}
        onMouseDown={(e) => e.stopPropagation()}>
        <label className="flex items-center gap-2 border-b border-line px-3 py-2">
          <Search size={15} className="text-muted" aria-hidden />
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a node: shadow, lifts, score…" aria-label="Find a node"
            role="combobox" aria-expanded="true" aria-controls="qs-list" aria-activedescendant={list[i] ? `qs-${i}` : undefined}
            className="w-full bg-transparent text-sm outline-none"
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setI((x) => Math.min(list.length - 1, x + 1)) }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setI((x) => Math.max(0, x - 1)) }
              else if (e.key === 'Enter' && list[i]) { e.preventDefault(); onPick(list[i]) }
              else if (e.key === 'Escape') { e.preventDefault(); onClose() }
            }} />
        </label>
        <ul id="qs-list" role="listbox" className="max-h-80 overflow-y-auto py-1">
          {list.map((e, k) => {
            const Icon = e.icon
            const researched = e.status === 'researched'
            return (
              <li key={e.ref} id={`qs-${k}`} role="option" aria-selected={k === i} onMouseEnter={() => setI(k)} onClick={() => onPick(e)}
                className={`flex cursor-pointer items-center gap-2.5 px-3 py-1.5 ${k === i ? 'bg-accent/10' : ''}`}>
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${researched ? 'border border-dashed border-slate-400 text-slate-500' : 'text-white'}`} style={researched ? undefined : { background: e.color }}><Icon size={15} aria-hidden /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium">{e.name}</span>
                  <span className="flex items-center gap-1 text-[10px] text-muted">{researched && <FlaskConical size={10} aria-hidden />}{STATUS_LABEL[e.status]}{e.category ? ` · ${e.category}` : ''}</span>
                </span>
              </li>
            )
          })}
          {!list.length && <li className="px-3 py-3 text-xs text-muted">No node matches "{q}".</li>}
        </ul>
        <div className="border-t border-line px-3 py-1.5 text-[10px] text-muted">↑ ↓ choose · Enter place · Esc close</div>
      </div>
    </div>
  )
}
