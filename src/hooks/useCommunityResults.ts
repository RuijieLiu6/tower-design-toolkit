import { useEffect, useMemo } from 'react'
import { useCommunityStore } from '../lib/communityStore'
import { layer0Summary } from '../lib/layer0Summary'
import { useProjectSiteArea } from '../lib/siteArea'
import { isCodeNode, runPackage, type CommunityResult } from '../lib/nodePackages'
import { codeNote, isAllowed, requestCodeRun, useCodeRuns } from '../lib/sandbox/codeRuns'
import { useStore, useTowers } from '../store'

export interface CommunityRun { results: CommunityResult[]; applies: boolean; error?: string }

/** Live results of every imported node on the current design, by node id. Code nodes the user allowed run in the
 *  sandbox (lib/sandbox); their values arrive a moment later. */
export function useCommunityResults(): Map<string, CommunityRun> {
  const towers = useTowers()
  const project = useStore((s) => s.project)
  const sun = useStore((s) => s.sun)
  const ground = useStore((s) => s.groundElevation)
  const studyArea = useProjectSiteArea().area
  const packages = useCommunityStore((s) => s.packages)
  const params = useCommunityStore((s) => s.params)
  const grants = useCodeRuns((s) => s.grants)
  const runs = useCodeRuns((s) => s.runs)

  const summary = useMemo(() => layer0Summary({ project, towers, sun, groundElevation: ground, studyArea }), [project, towers, sun, ground, studyArea])

  // Ask for sandbox runs (deduplicated by node, code, design and parameters, so many callers start one run).
  useEffect(() => {
    for (const p of packages) {
      if (isCodeNode(p) && (!p.projects || p.projects.includes(project)) && isAllowed(p, grants)) requestCodeRun(p, summary, params[p.id] ?? {})
    }
  }, [packages, summary, params, grants, project])

  return useMemo(() => {
    const out = new Map<string, CommunityRun>()
    for (const p of packages) {
      const applies = !p.projects || p.projects.includes(project)
      try {
        const code = isCodeNode(p) ? (() => { const allowed = isAllowed(p, grants), run = runs[p.id]; return { values: allowed && run?.status === 'done' ? run.values : undefined, note: codeNote(p, run, allowed) } })() : undefined
        out.set(p.id, { results: applies ? runPackage(p, summary, params[p.id], code) : [], applies })
      } catch (e) {
        // Only a package edited outside Tower Design Toolkit can get here: import validation rejects broken formulas.
        out.set(p.id, { results: [], applies, error: (e as Error).message })
      }
    }
    return out
  }, [summary, project, packages, params, grants, runs])
}
