// Cards and wires for switched-on community nodes on the node canvas (NodeCanvas adds them after the built nodes).
import type { Edge, Node } from '@xyflow/react'
import type { Category } from '../data/registry'
import type { CommunityRun } from '../hooks/useCommunityResults'
import { summarize, type NodePackage } from '../lib/nodePackages'

type Card = { title: string; category: Category; subtitle: string; status: string; tone: 'ok' | 'warn' | 'bad' | 'muted'; inputs: boolean; outputs: boolean }

/** Which Layer 0 card a summary value comes from. */
const sourceCard = (name: string) =>
  name.startsWith('sun.') || name.startsWith('project.is') || name === 'project.siteArea' || name === 'project.groundElevation' ? 'l0.site'
    : name.includes('gfa') || name === 'project.fsr' ? 'l0.program'
      : 'l0.massing'

export function communityCanvas(packages: NodePackage[], runs: Map<string, CommunityRun>, enabled: Record<string, boolean>, startSlot: number, selectedNode: string | null) {
  const nodes: Node<Card>[] = []
  const edges: Edge[] = []
  const wire = { stroke: '#9aa3ad', strokeDasharray: '3 3' }
  packages.filter((p) => enabled[p.id] && runs.get(p.id)?.applies).forEach((p, k) => {
    const run = runs.get(p.id)!
    const s = run.error ? { text: 'Could not run', tone: 'bad' as const } : summarize(run.results)
    nodes.push({
      id: p.id, type: 'card', position: { x: 320, y: (startSlot + k) * 120 }, selected: selectedNode === p.id,
      data: { title: p.name, category: p.category, subtitle: 'Community · unverified', status: s.text, tone: s.tone, inputs: true, outputs: true },
    })
    for (const src of new Set(p.inputs.map(sourceCard))) edges.push({ id: `${src}-${p.id}`, source: src, target: p.id, style: wire })
    edges.push({ id: `${p.id}-report`, source: p.id, target: 'report', style: { stroke: '#1f5f8b', strokeDasharray: '3 3' } })
  })
  return { nodes, edges }
}
