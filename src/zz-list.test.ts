import { it } from 'vitest'
import { BUILT_NODES, MERGES } from './data/registry'
import { DESIGN_NODES } from './lib/workflow/designNodes'
import { PHASES, phaseOfNode } from './lib/phases'
it('list', () => {
  const rows = BUILT_NODES.map((n) => ({ id: n.id, name: n.name, phase: phaseOfNode(n.id)?.id ?? '?', status: n.status, on: !n.defaultOff, projects: (n.projects ?? []).join('+'), parts: (MERGES[n.id]?.parts ?? []).map((p) => p.tab).join(' · ') }))
  console.log('PHASES ' + PHASES.map((p) => p.id + '=' + p.name).join(' | '))
  console.log('DESIGN ' + DESIGN_NODES.map((d) => d.id + '=' + d.name + '@' + d.phase).join(' | '))
  for (const r of rows) console.log('ROW\t' + [r.phase, r.name, r.status, r.on ? 'on' : 'off', r.projects, r.parts].join('\t'))
})
