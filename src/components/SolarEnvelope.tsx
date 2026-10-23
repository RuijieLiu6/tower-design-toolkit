// Solar envelope for the Real Vancouver project: over the selected tower's site, the tallest massing that casts no
// shadow on the spaces the guideline protects with a no-new-shadow rule (parks and school sites 3.1.1, Sun Yat-Sen
// 4.1.1, the Davie and Robson north sidewalks 3.3.1), each in its own window. Panel for the solar node, and a 3D overlay.
import { useMemo } from 'react'
import { create } from 'zustand'
import { towerFootprint } from '../engine/massing'
import { solarPosition, studyWindow } from '../engine/solar'
import { distanceTo, table1Spaces } from '../engine/solarCity'
import { envelopeUnder, solarEnvelope, type EnvSpace } from '../engine/solarEnvelope'
import { RULES, ruleForClass, type RuleId } from '../engine/solarRules'
import { SOLAR_NODE, useSolar } from '../hooks/useSolarAccess'
import { useStore, useTowers } from '../store'
import { FlagChip, Section, Toggle } from './ui'

export const useEnvelopeStore = create<{ show: boolean; set: (show: boolean) => void }>((set) => ({ show: false, set: (show) => set({ show }) }))

const CELL = 4, MARGIN = 24, CAP = 400

/** The envelope over the selected tower's site, or null when it does not apply (or is switched off). */
export function useSolarEnvelope() {
  const show = useEnvelopeStore((s) => s.show)
  const project = useStore((s) => s.project)
  const on = useStore((s) => !!s.enabled[SOLAR_NODE])
  const ground = useStore((s) => s.groundElevation)
  const selected = useStore((s) => s.selectedTower)
  const towers = useTowers()
  const out = useSolar((s) => s.out)
  return useMemo(() => {
    if (!show || !on || project !== 'city') return null
    const t = towers.find((x) => x.id === selected) ?? towers[0]
    if (!t) return null
    const fp = towerFootprint(t, t.podiumHeight > 0)
    const xs = fp.map((p) => p[0]), ys = fp.map((p) => p[1])
    const site = { x0: Math.min(...xs) - MARGIN, y0: Math.min(...ys) - MARGIN, x1: Math.max(...xs) + MARGIN, y1: Math.max(...ys) + MARGIN }
    const centre: [number, number] = [(site.x0 + site.x1) / 2, (site.y0 + site.y1) / 2]
    const eq = studyWindow('equinox')
    const minAlt = Math.min(solarPosition(eq.startUtc).altitude, solarPosition(eq.endUtc).altitude)
    const reach = CAP / Math.tan((minAlt * Math.PI) / 180) + Math.hypot(site.x1 - site.x0, site.y1 - site.y0) / 2
    const z = new Map((out?.spaces ?? []).map((s) => [s.id, s.z]))
    const spaces: EnvSpace[] = []
    for (const s of table1Spaces()) {
      const rule: RuleId | null = s.rule ?? (s.t1 ? ruleForClass(s.t1.cls, s.t1.note) : null)
      if (!rule || RULES[rule].kind !== 'no_new_shadow') continue
      if (distanceTo(s.rings, centre) > reach) continue
      spaces.push({ id: s.id, name: s.name, rings: s.rings, z: z.get(s.id) ?? ground, win: studyWindow(RULES[rule].window) })
    }
    const t0 = performance.now()
    const env = solarEnvelope(spaces, site, { cell: CELL, base: ground, northDeg: 0, cap: CAP })
    const under = envelopeUnder(env, towerFootprint(t), t.height)
    return { env, under, tower: t, ms: Math.round(performance.now() - t0), base: ground, terrainKnown: z.size > 0 }
  }, [show, on, project, towers, selected, ground, out])
}

export function SolarEnvelopePanel() {
  const project = useStore((s) => s.project)
  const { show, set } = useEnvelopeStore()
  const r = useSolarEnvelope()
  if (project !== 'city') return null
  return (
    <Section title="Solar envelope" right={r ? <span className="text-[10px] text-muted">{r.ms} ms</span> : null}>
      <label className="flex items-center justify-between gap-2 text-[11px]"><span>Show the envelope over this tower's site</span><Toggle checked={show} onChange={() => set(!show)} label="Show the solar envelope" /></label>
      {r && (
        <div className="mt-2 grid gap-1 text-[11px]">
          <div><b>{r.under.min >= CAP ? `above ${CAP} m` : `${Math.round(r.under.min)} m`}</b> is the tallest the tower footprint can rise without shadowing a protected space{r.under.by ? ` (set by ${r.under.by})` : ''}.</div>
          <div className={r.under.share > 0 ? 'text-red-700' : 'text-emerald-700'}>{r.under.share > 0 ? `${r.tower.name} (${Math.round(r.tower.height)} m) rises through the envelope over ${Math.round(r.under.share * 100)}% of its footprint.` : `${r.tower.name} (${Math.round(r.tower.height)} m) stays inside the envelope.`}</div>
          <div className="text-muted">{r.env.spaces.length} protected spaces within reach: {r.env.spaces.map((s) => s.name).join(', ') || 'none'}.</div>
        </div>
      )}
      <p className="mt-1.5 text-[10px] text-muted">Each column is tested every 15 minutes in each space's window (22 Sep 10:00–16:00 PT; Robson Village until 15:00). Conservative: shadow the existing city already casts is not subtracted, so the true "no new shadow" envelope is at least this high. Plazas and miniparks (minimise only, 3.2.1) and the cenotaph (clock unresolved) are left out. {r && !r.terrainKnown ? 'Spaces not yet tested by the solar run are taken at the tower base.' : 'Spaces sit at their terrain elevation where the solar run measured it.'}</p>
      <div className="mt-1 flex items-center gap-1"><FlagChip flag="team_assumption" /><span className="text-[10px] text-muted">Envelope method (column test, 4 m cells) is a team construction from clauses 3.1.1, 3.3.1, 4.1.1 and 5.2.1.</span></div>
    </Section>
  )
}
