import { Box, Camera, Download, LayoutPanelTop, ScanEye } from './icons'
import { VTC_NORTH_DEG } from '../context'
import { captureShot, downloadPlanSvg } from '../lib/capture'
import { towerFloors } from '../engine/massing'
import { typicalFloor } from '../engine/plan'
import { USES } from '../engine/types'
import { useStore, useTowers, type Representation } from '../store'
import DrawingsSection from './drawings/DrawingsSection'
import BoardsSection from './BoardsSection'
import { captureHiResShot } from '../lib/hiresCapture'
import { Section } from './ui'
import { useShallow } from 'zustand/react/shallow'
import { useSceneStyle, type SceneStyle } from '../lib/sceneStyle'
import Help from './Help'

export default function PresentPanel() {
  const { project, set, presentRep, groundElevation, selectedTower, boardView, planLevel, planGrid } = useStore(useShallow((s) => ({ project: s.project, set: s.set, presentRep: s.presentRep, groundElevation: s.groundElevation, selectedTower: s.selectedTower, boardView: s.boardView, planLevel: s.planLevel, planGrid: s.planGrid })))
  const towers = useTowers()
  const t = towers.find((x) => x.id === selectedTower) ?? towers[0]

  // Camera presets in the model frame (x, y, z-up). VTC: true north is 45 deg clockwise from the grid.
  const rad = (VTC_NORTH_DEG * Math.PI) / 180
  const south: [number, number] = [-Math.sin(rad), -Math.cos(rad)]
  // Axonometric: 6 deg lens from the isometric direction, far enough to frame the tower (near-parallel projection).
  const base = project === 'city' ? groundElevation : 0
  const axoDist = ((t?.height ?? 200) * 1.5) / (2 * Math.tan((3 * Math.PI) / 180))
  const iso = [Math.cos(Math.atan(1 / Math.SQRT2)) / Math.SQRT2, -Math.cos(Math.atan(1 / Math.SQRT2)) / Math.SQRT2, Math.sin(Math.atan(1 / Math.SQRT2))]
  const axo: { name: string; position: number[]; target: number[]; fov?: number } = { name: 'Axonometric (near-parallel)', position: [(t?.x ?? 0) + iso[0] * axoDist, (t?.y ?? 0) + iso[1] * axoDist, base + (t?.height ?? 200) / 2 + iso[2] * axoDist], target: [t?.x ?? 0, t?.y ?? 0, base + (t?.height ?? 200) / 2], fov: 6 }
  type Preset = { name: string; position: number[]; target: number[]; fov?: number }
  const presets: Preset[] = project === 'vtc' ? [
    { name: 'Aerial', position: [380, -420, 520], target: [0, 0, 80] },
    // On the retail high street (y -64 to -40, between the heritage block and the site); y -75 was inside the heritage block.
    { name: 'Street: retail high street', position: [10, -52, 1.6], target: [t?.x ?? 0, t?.y ?? 0, 60], fov: 60 },
    { name: 'Skyline from the south (toward QE Park)', position: [south[0] * 3200, south[1] * 3200, 125], target: [0, 0, 150], fov: 28 },
    // The brief's suggested "mid-city view" (p.30): from inside the city, 700 m south-west and 90 m up (a mid-rise roof),
    // the tower against its neighbours. Camera choice is a team assumption (run-through G8, 4 Nov).
    { name: 'Mid-city view (700 m south-west, 90 m up)', position: [(t?.x ?? 0) - 500, (t?.y ?? 0) - 490, 90], target: [t?.x ?? 0, t?.y ?? 0, 120], fov: 40 },
    axo,
  ] : [
    { name: 'Aerial', position: [2600, -3600, 2400], target: [400, 200, 80] },
    { name: 'Tower close-up', position: [(t?.x ?? 0) + 400, (t?.y ?? 0) - 500, 300], target: [t?.x ?? 0, t?.y ?? 0, 80] },
    { name: 'Mid-city view (700 m south-west, 90 m up)', position: [(t?.x ?? 0) - 500, (t?.y ?? 0) - 490, base + 90], target: [t?.x ?? 0, t?.y ?? 0, base + 120], fov: 40 },
    axo,
  ]

  const REPS: { id: Representation; label: string; icon: typeof Box; hint: string }[] = [
    { id: 'clay', label: 'Clay', icon: Box, hint: 'Solid massing with program colours' },
    { id: 'xray', label: 'X-ray', icon: ScanEye, hint: 'Ghosted shell with plates, core and plant' },
  ]
  // Floor plan levels to offer: the typical floor, the middle floor of each use, sky lobbies, a podium floor and the top.
  const floors = t ? towerFloors(t) : []
  const typical = t ? typicalFloor(t) : null
  const levelOptions: { level: number; label: string }[] = []
  const seen = new Set<number>()
  const addLevel = (level: number | undefined, label: string) => { if (level === undefined || seen.has(level)) return; seen.add(level); levelOptions.push({ level, label }) }
  for (const use of [...new Set(floors.filter((f) => !f.podium && !f.skyLobby && f.z0 > 0.5).map((f) => f.use))]) {
    const of = floors.filter((f) => f.use === use && !f.podium && !f.skyLobby && f.z0 > 0.5)
    addLevel(of[Math.floor(of.length / 2)]?.level, `${USES[use].label} (middle floor)`)
  }
  for (const f of floors.filter((x) => x.skyLobby)) addLevel(f.level, t?.skyRoom?.level === f.level ? 'Public sky room' : 'Sky lobby')
  addLevel(floors.find((f) => f.podium && f.z0 > 0.5)?.level, 'Podium')
  addLevel(floors[floors.length - 1]?.level, 'Top floor')
  levelOptions.sort((a, b) => a.level - b.level)

  return (
    <div>
      <Section title="Board">
        <div role="radiogroup" aria-label="Board content" className="grid grid-cols-2 gap-1.5">
          {([['3d', '3D view', Box], ['plan', 'Floor plan', LayoutPanelTop]] as const).map(([id, label, Icon]) => (
            <button key={id} role="radio" aria-checked={boardView === id} onClick={() => set({ boardView: id })}
              className={`flex items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-xs ${boardView === id ? 'border-accent bg-accent text-white' : 'border-line hover:border-accent'}`}><Icon size={13} />{label}</button>
          ))}
        </div>
        {boardView === 'plan' && (
          <div className="mt-2 grid gap-2">
            <label className="flex flex-col gap-1 text-xs"><span className="text-muted">Level</span>
              <select value={planLevel ?? ''} onChange={(e) => set({ planLevel: e.target.value === '' ? null : Number(e.target.value) })} className="rounded border border-line bg-panel px-1.5 py-1 text-xs" aria-label="Floor plan level">
                <option value="">Typical floor (level {typical?.level ?? '—'})</option>
                {levelOptions.map((o) => <option key={o.level} value={o.level}>Level {o.level} · {o.label}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={planGrid} onChange={() => set({ planGrid: !planGrid })} />Indicative structural grid</label>
            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => captureShot(true)} className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"><Download size={13} />PNG</button>
              <button onClick={() => downloadPlanSvg()} className="flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-xs hover:border-accent"><Download size={13} />SVG, to scale</button>
            </div>
            <p className="flex items-center gap-1 text-[10px] text-muted"><Help label="About the floor plan drawing">Drawn at the largest standard scale that fits the A2 board; the SVG prints at that scale.</Help>No names or logos on the boards (brief p.27).</p>
          </div>
        )}
      </Section>
      {boardView === '3d' && <>
      <Section title="Representation">
        <div role="radiogroup" aria-label="Representation" className="grid grid-cols-2 gap-1.5">
          {REPS.map(({ id, label, icon: Icon, hint }) => (
            <button key={id} role="radio" aria-checked={presentRep === id} title={hint} onClick={() => set({ presentRep: id })}
              className={`flex items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-xs ${presentRep === id ? 'border-accent bg-accent text-white' : 'border-line hover:border-accent'}`}><Icon size={13} />{label}</button>
          ))}
        </div>
        {project === 'city' && <CityStyle />}
        <p className="mt-1.5 text-[10px] text-muted">The model is locked here: go back to Massing or Schematic to change it.</p>
      </Section>
      <Section title="Camera presets">
        <div className="grid gap-1.5">
          {presets.map((p) => (
            <button key={p.name} onClick={() => set({ cameraRequest: { position: p.position as [number, number, number], target: p.target as [number, number, number], fov: p.fov } })}
              className="flex items-center gap-2 rounded-md border border-line px-2 py-1.5 text-left text-xs hover:border-accent"><Camera size={13} />{p.name}</button>
          ))}
        </div>
        {project === 'city' && <p className="mt-2 text-[11px] text-muted">For protected viewpoints, use "View from this viewpoint" in the view-cone results.</p>}
      </Section>
      </>}
      <Section title="Capture">
        <button onClick={() => captureShot(true)} className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"><Download size={13} />Capture and download (PNG)</button>
        {boardView === '3d' && <button onClick={() => captureHiResShot()} title="Re-renders this camera at about 3500 px wide, enough for a full A2 board at 150 dpi" className="mt-1.5 flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-xs hover:border-accent"><Camera size={13} />Capture at print size (3508 px)</button>}
        <p className="mt-1 text-[10px] text-muted">The capture is the board frame (A2 landscape, 1.414:1). Shots also collect in the strip on the left. A screen capture is about 1,000–1,500 px: use print size for images that fill a board.</p>
      </Section>
      <DrawingsSection />
      <BoardsSection />
    </div>
  )
}

/** Real Vancouver's style for the board: Plain (pure tints by building type) or Context (Vista's textures). */
function CityStyle() {
  const style = useSceneStyle((s) => s.style)
  const opt = (id: SceneStyle, label: string, hint: string) => (
    <button key={id} role="radio" aria-checked={style === id} title={hint} onClick={() => useSceneStyle.setState({ style: id })}
      className={`rounded-md border px-2 py-1.5 text-xs ${style === id ? 'border-accent bg-accent text-white' : 'border-line hover:border-accent'}`}>{label}</button>
  )
  return (
    <div role="radiogroup" aria-label="Style" className="mt-1.5 grid grid-cols-2 gap-1.5">
      {opt('plain', 'Plain', 'Pure colours: existing buildings tinted by type')}
      {opt('context', 'Context', "Vista's textures: facades, paving, asphalt, grass and water")}
    </div>
  )
}
