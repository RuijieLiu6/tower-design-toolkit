// The pending tower proposal (or the drag in progress) as the 3D ghost and the toolbar see it: its pose, the tower
// base there, and the report from lib/proposalCheck.ts. Cheap enough to follow the pointer (one footprint against 24
// cones). The terrain lookup is fed by TowerGizmo's CityGround only in Real Vancouver, so the competition site never
// loads the city data.
import { useMemo } from 'react'
import { create } from 'zustand'
import { rectCorners } from '../engine/massing'
import type { Tower } from '../engine/types'
import type { Pt } from '../lib/edgeSnap'
import { proposalReport, type ProposalInput, type ProposalReport } from '../lib/proposalCheck'
import { useSiteGeometry } from '../lib/siteGeometry'
import { useTowerEdit, type Pose } from '../lib/towerEdit'
import { useStore } from '../store'

type Under = NonNullable<ProposalInput['ground']['under']>
export const useGroundUnder = create<{ under: Under | null }>(() => ({ under: null }))

/** Pose shown for this tower while it is being moved: the drag, else the pending proposal, else null. */
export function useLivePose(id: string | null | undefined): Pose | null {
  return useTowerEdit((s) => (!id ? null : s.drag?.id === id ? s.drag.live : s.proposal?.id === id ? s.proposal.pose : null))
}

/** Tower base at a pose: the terrain under the shaft rectangle when the base follows the terrain (as it will after the move). */
export function baseAt(t: Tower, p: Pose, project: 'vtc' | 'city', mode: 'terrain' | 'manual', elevation: number, under: Under | null): number {
  if (project !== 'city') return 0
  const g = mode === 'terrain' && under ? under(rectCorners(p.x, p.y, t.width, t.depth, p.rotation) as Pt[]) : null
  return g ? Math.round(g.value * 10) / 10 : elevation
}

export function useProposalReport(t: Tower | undefined, pose: Pose | null): ProposalReport | null {
  const project = useStore((s) => s.project)
  const mode = useStore((s) => s.groundMode)
  const elevation = useStore((s) => s.groundElevation)
  const fsrTier = useStore((s) => s.fsrTier)
  const transitLink = useStore((s) => s.transitLink)
  const site = useSiteGeometry((s) => s.site[project])
  const under = useGroundUnder((s) => s.under)
  return useMemo(() => (t && pose ? proposalReport({ project, tower: t, pose, site, ground: { mode, elevation, under }, rules: { fsrTier, transitLink } }) : null),
    [t, pose, project, site, mode, elevation, under, fsrTier, transitLink])
}
