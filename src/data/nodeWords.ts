// The short name of each design node (one or two words), shown under its illustration wherever nodes are tiles: the
// cover, the workflow composer and the node bar (voice control uses the same words). Kept apart from the components so
// the cover's first-screen bundle does not pull in the app.
/** The key word under each check's icon: one or two words, taken from its name where possible (voice control). */
export const NODE_WORDS: Record<string, string> = {
  'built.vtc-rules': 'Hard rules', 'built.fsr': 'FSR', 'built.viewcones': 'Site limits', 'built.separation': 'Separation', 'built.floorplate': 'Plate', 'built.relax-aviation': 'Aviation',
  'built.sun': 'Shadow', 'built.core-lifts': 'Core', 'built.egress': 'Egress', 'built.life-safety': 'Life safety',
  'built.sky-room': 'Sky room', 'built.economics': 'Value', 'built.culture-claims': 'Claims', 'built.model': 'Model',
  'built.provenance': 'AI-use log', 'built.mobility': 'Mobility', 'built.facade': 'Facade', 'built.interior': 'Interior',
  'built.daylight-depth': 'Daylight', 'built.f2f-use': 'Storey', 'built.view-from': 'Views', 'built.vista': 'Vista', 'built.heights': 'Height',
  'built.pr-streetwall': 'Public realm', 'built.pr-frontage': 'Frontage', 'built.pr-ground': 'Open space',
  'built.city-in-nature': 'Green claims', 'built.solar-access': 'Sun hours', 'built.wind-procedure': 'Slenderness',
  'built.structure': 'Structure', 'built.wind-study': 'Wind study', 'built.wind-screen': 'Wind screen', 'built.trips': 'Trips',
  'built.energy-carbon': 'Energy', 'built.silhouette': 'Skyline',
  // design nodes (lib/workflow/designNodes.ts)
  'design.site': 'Site', 'design.massing': 'Massing', 'design.program': 'Program', 'design.plates': 'Core & plates', 'design.frame': 'Frame',
  'built.sw-shadow': 'Shadow', 'built.sw-sun-faces': 'Facade sun', 'built.sw-pv': 'PV', 'built.sw-wind-comfort': 'Ped. wind', 'built.sw-wind-height': 'Terrace wind', 'built.sw-rain-faces': 'Driving rain', 'built.sw-rain-water': 'Rain', 'built.sw-form': 'Form', 'built.sw-glazing': 'Façade', 'built.sw-daylight': 'sDA', 'built.sw-light-hour': 'Light now', 'built.sw-natvent': 'Ventilation', 'built.sw-airflow': 'Air flow', 'built.sw-energy': 'Energy', 'built.sw-indoor-temp': 'Indoor temp',
}
/** A node without a word of its own (a community node): the first word of its name. */
export const nodeWord = (n: { id: string; name: string }) => NODE_WORDS[n.id] ?? n.name.split(/[\s:&,(]+/).filter(Boolean)[0] ?? n.name
