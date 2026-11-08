// The map's loading bar (Ruijie, 7 Nov): while the Real Vancouver map is still downloading its data, a slim bar over the
// top of the view says so and shows how much has arrived, with the part being loaded in words. It appears only while
// something loads and fades out at 100%. Shares come from lib/loadProgress.ts (real bytes where the size is known).
import { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { progressOf, useLoadProgress } from '../lib/loadProgress'

export default function LoadingBar() {
  const jobs = useLoadProgress(useShallow((s) => Object.values(s.jobs)))
  const p = progressOf(jobs)
  const busy = jobs.length > 0
  // a short delay before showing, so a quick load (from the cache) doesn't flash a bar
  const [shown, setShown] = useState(false)
  useEffect(() => {
    if (!busy) { setShown(false); return }
    const t = setTimeout(() => setShown(true), 250)
    return () => clearTimeout(t)
  }, [busy])
  if (!busy || !shown) return null
  const pct = Math.round(p.share * 100)
  const failed = jobs.filter((j) => j.failed).length
  return (
    <div className="pointer-events-none absolute left-1/2 top-14 z-20 w-[min(22rem,60%)] -translate-x-1/2 rounded-xl border border-line bg-panel px-3 py-2 shadow-float" data-testid="map-loading">
      <div className="flex items-baseline justify-between gap-2 text-meta">
        <span className="truncate text-ink"><span className="font-semibold">{p.done ? 'Map loaded' : 'Loading the map'}</span>{p.label && !p.done ? <span className="text-muted"> · {p.label}</span> : null}</span>
        <span className="tabular-nums text-muted">{pct}%</span>
      </div>
      <div role="progressbar" aria-label="Map loading" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-valuetext={`${pct}% of the map loaded${p.label ? `, now ${p.label}` : ''}`}
        className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-subtle">
        <div className="h-full rounded-full bg-accent transition-[width] duration-200 ease-out motion-reduce:transition-none" style={{ width: `${pct}%` }} />
      </div>
      {failed > 0 && <p className="mt-1 text-meta text-warning">{failed} part{failed > 1 ? 's' : ''} could not load; the map shows what it has.</p>}
    </div>
  )
}
