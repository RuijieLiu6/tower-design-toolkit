import type { Flag } from '../engine/types'
import { useStore } from '../store'
import { FlagChip } from './ui'

export default function StatusBar() {
  const project = useStore((s) => s.project)
  return (
    <footer className="flex h-8 shrink-0 items-center gap-3 overflow-hidden whitespace-nowrap border-t border-line bg-panel px-4 text-[10px] text-muted">
      <span className="font-semibold uppercase tracking-wider">Evidence</span>
      {(['verified', 'team_assumption', 'unverified', 'unresolved', 'false_assumption'] as Flag[]).map((f) => <FlagChip key={f} flag={f} />)}
      <span className="mx-auto" />
      <span className="min-w-0 truncate">{project === 'vtc' ? 'Competition context © Buildner (local only, not published) · metres · true north 45° from grid' : 'City of Vancouver open data (OGL-Vancouver) · EPSG:26910 · heights geodetic, CGVD28 assumed'}</span>
      <span className="rounded bg-slate-100 px-1.5 py-0.5">Study tool, not a compliance determination</span>
    </footer>
  )
}
