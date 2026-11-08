// What each built analysis node needs to run, for the workflow assistant's "Explain" (Ruijie, 7 Nov: "explain why a node
// is included and what information it requires"). `reads`: what it takes from the shared tower model and the site, with
// nothing to enter; `asks`: what a person enters or chooses for it (the node's own panel unless said). Written from each
// engine's inputs (src/engine) and the registry's limits; when a node gains an input, add it here (nodeNeeds.test.ts
// checks every built node has an entry).
export interface NodeNeeds { reads: string[]; asks: string[] }

export const NODE_NEEDS: Record<string, NodeNeeds> = {
  'built.vtc-rules': { reads: ['each tower’s height, floors and uses', 'the competition block'], asks: ['the FSR tier you claim', 'whether the below-grade transit link is designed'] },
  'built.fsr': { reads: ['every floor’s area and use', 'the site area (the block, or the study site’s parcels)'], asks: [] },
  'built.viewcones': { reads: ['each tower’s outline and top height', 'the ground elevation', 'the City view cones'], asks: ['a Real Vancouver tower position'] },
  'built.relax-aviation': { reads: ['the towers’ heights and positions', 'the view cones'], asks: ['which relaxation routes to switch on per cone'] },
  'built.sun': { reads: ['the towers’ massing', 'true north'], asks: ['the date and hour (Sun & time)'] },
  'built.solar-access': { reads: ['the towers’ massing', 'the protected parks and school sites', 'the City buildings with LiDAR heights'], asks: ['a reading for spaces the guidelines leave open (competition site)'] },
  'built.core-lifts': { reads: ['the floors and uses of each tower', 'the core size'], asks: ['lift presets (car size, speed, people per area)', 'sky lobbies, if any'] },
  'built.egress': { reads: ['the floors, uses and core of each tower'], asks: ['stair placement', 'a posted limit for a public sky room, if any'] },
  'built.life-safety': { reads: ['the tower height, floors and uses'], asks: ['plant floors, risers and generator presets'] },
  'built.sky-room': { reads: ['the sky lobbies and the lift and stair results'], asks: ['which sky lobby is public', 'visitor lifts and hours'] },
  'built.economics': { reads: ['every floor’s area and use', 'the height of each floor'], asks: ['the permit date', 'the land price', 'whether regional charges apply'] },
  'built.culture-claims': { reads: [], asks: ['the engagement level per Nation, with evidence', 'the board text to check'] },
  'built.model': { reads: ['the uploaded Rhino model and its layers'], asks: ['the role of each layer (towers, core, site, context)'] },
  'built.provenance': { reads: [], asks: ['for each board element: how it was made, the tool, and who decided'] },
  'built.mobility': { reads: ['the floor areas by use', 'the street types around the site'], asks: ['loading, ramp and drop-off positions', 'truck arrivals, if known'] },
  'built.facade': { reads: ['each tower’s faces and floors', 'true north'], asks: ['the facade system', 'the share of bird-friendly glass'] },
  'built.interior': { reads: ['the typical floors of each use'], asks: ['the unit mix and sizes', 'the activities on public floors'] },
  'built.daylight-depth': { reads: ['the typical floor plates and the core', 'floor-to-floor heights'], asks: ['the window head drop'] },
  'built.view-from': { reads: ['the City buildings and terrain', 'your towers'], asks: ['a place to stand: a roof, a street point or a floor'] },
  'built.vista': { reads: ['the study site and its parcels', 'the view cones and the terrain'], asks: ['an address, a drawn site or a GeoJSON file'] },
  'built.heights': { reads: ['the zoning districts and view cones over the site'], asks: [] },
  'built.pr-streetwall': { reads: ['the podium and tower blocks', 'the streets and their right-of-way'], asks: ['each street’s type (Real Vancouver)'] },
  'built.pr-frontage': { reads: ['the blocks at grade', 'the streets around the site'], asks: ['per street: active share, entrances, weather protection, driveways'] },
  'built.pr-ground': { reads: ['the open ground of the site', 'the solar access and wind screen results, when on'], asks: ['the public share of open ground', 'a mid-block link', 'whether a station entrance adjoins the site'] },
  'built.city-in-nature': { reads: ['the site area', 'the view-cone answer (Real Vancouver)'], asks: ['canopy, cover, retention and habitat values (until modelled)'] },
  'built.wind-procedure': { reads: ['each tower’s height and plate widths'], asks: ['the engineer’s natural frequency, if known'] },
  'built.structure': { reads: ['the tower height, floor areas and core'], asks: ['outrigger floors, if any'] },
  'built.wind-study': { reads: ['each tower’s height'], asks: [] },
  'built.wind-screen': { reads: ['the towers and the context buildings upwind', 'the wind record at the airport'], asks: [] },
  'built.trips': { reads: ['the people in each tower from the lift check', 'the retail and civic areas'], asks: ['the share arriving by the station link'] },
  'built.energy-carbon': { reads: ['the floor areas by use', 'the lift count', 'the roofs and facades for PV'], asks: ['the envelope and heating choices', 'the structure system for embodied carbon'] },
}
