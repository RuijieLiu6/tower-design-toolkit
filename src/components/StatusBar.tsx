// The status line under the workspace. The data attribution stays visible (licences: OGL-Vancouver, OSM ODbL; the
// competition context is Buildner's and local only). The full evidence key (verified, team assumption, unverified,
// unresolved, false assumption) opens on request (overnight brief, 8 Nov: "Show the current result's status; disclose
// the full key when requested"): each result shows its own flag where it is.
import { useEffect, useRef, useState } from 'react'
import type { Flag } from '../engine/types'
import { useStore } from '../store'
import { useCityModel } from '../lib/cityModel'
import { FlagChip } from './ui'
import { Info } from './icons'

const MEANING: Record<Flag, string> = {
  verified: 'checked against the cited source',
  team_assumption: 'a value the team chose; editable',
  unverified: 'from a source not yet checked, or an estimate',
  unresolved: 'the sources disagree or are missing',
  false_assumption: 'a claim found to be wrong, kept visible with its correction',
} as Record<Flag, string>

export default function StatusBar() {
  const project = useStore((s) => s.project)
  const vista = useCityModel((s) => s.model === 'vista')
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    window.addEventListener('keydown', key); window.addEventListener('pointerdown', away, true)
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('pointerdown', away, true) }
  }, [open])
  return (
    <footer className="flex h-7 shrink-0 items-center gap-3 whitespace-nowrap px-2 text-meta text-muted">
      <div ref={box} className="relative">
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} data-testid="evidence-key"
          className="flex h-6 items-center gap-1 rounded-lg px-1.5 text-meta text-ink outline-none hover:bg-subtle focus-visible:ring-2 focus-visible:ring-accent"><Info size={13} aria-hidden />Evidence key</button>
        {open && (
          <div role="dialog" aria-label="Evidence key" className="absolute bottom-full left-0 z-50 mb-2 w-[26rem] rounded-xl border border-line bg-panel p-3 text-ink shadow-float">
            <p className="text-control font-semibold">What a result's evidence flag means</p>
            <ul className="mt-2 grid gap-1.5">
              {(['verified', 'team_assumption', 'unverified', 'unresolved', 'false_assumption'] as Flag[]).map((f) => (
                <li key={f} className="flex items-center gap-2 whitespace-normal"><FlagChip flag={f} /><span className="text-meta text-muted">{MEANING[f]}</span></li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <span className="mx-auto" />
      <span className="min-w-0 truncate" title="Data sources and licences">{project === 'vtc' ? 'Competition context © Buildner (local only, not published) · metres · true north 45° from grid' : `City of Vancouver open data (OGL-Vancouver)${vista ? ' · buildings © OpenStreetMap contributors (ODbL), via Vista' : ''} · EPSG:26910 · heights geodetic, CGVD28 assumed`}</span>
      <span className="shrink-0">Study tool, not a compliance determination</span>
    </footer>
  )
}
