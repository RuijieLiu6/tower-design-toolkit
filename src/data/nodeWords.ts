// The short name of each design node (one or two words), shown under its illustration wherever nodes are tiles: the
// cover, the workflow composer and the node bar (voice control uses the same words). Kept apart from the components so
// the cover's first-screen bundle does not pull in the app.
/** The key word under each check's icon: one or two words, taken from its name where possible (voice control). */
export const NODE_WORDS: Record<string, string> = {
  'built.vtc-rules': 'Hard rules', 'built.fsr': 'FSR', 'built.viewcones': 'View-cone', 'built.relax-aviation': 'Aviation',
  'built.sun': 'Shadow', 'built.core-lifts': 'Lift check', 'built.egress': 'Egress', 'built.life-safety': 'Life safety',
  'built.sky-room': 'Sky room', 'built.economics': 'Value', 'built.culture-claims': 'Claims', 'built.model': 'Model',
  'built.provenance': 'AI-use log', 'built.mobility': 'Parking', 'built.facade': 'Facade', 'built.interior': 'Interior',
  'built.daylight-depth': 'Daylight', 'built.view-from': 'View from', 'built.vista': 'Vista', 'built.heights': 'Height',
  'built.pr-streetwall': 'Streetwall', 'built.pr-frontage': 'Frontage', 'built.pr-ground': 'Open space',
  'built.city-in-nature': 'Nature', 'built.solar-access': 'Sun hours', 'built.wind-procedure': 'Slenderness',
  'built.structure': 'Structure', 'built.wind-study': 'Wind study', 'built.wind-screen': 'Wind screen', 'built.trips': 'Trips',
  'built.energy-carbon': 'Energy',
}
/** A node without a word of its own (a community node): the first word of its name. */
export const nodeWord = (n: { id: string; name: string }) => NODE_WORDS[n.id] ?? n.name.split(/[\s:&,(]+/).filter(Boolean)[0] ?? n.name
