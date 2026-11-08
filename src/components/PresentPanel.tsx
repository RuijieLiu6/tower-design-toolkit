// Present's panel (Ruijie, 6 Nov: tools as icons with a key word, long text behind "?"): the board (3D view or floor
// plan), the representation, camera presets and capture, each an icon tile with its full name on hover (IconTile.tsx).
import { Box, Building, Building2, Camera, Cuboid, Download, FileDown, Globe, Layers, LayoutPanelTop, Mountain, PersonStanding, ScanEye, Square, type LucideIcon } from './icons'
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
import IconTile from './IconTile'

export default function PresentPanel() {
  const { project, set, presentRep, groundElevation, selectedTower, boardView, planLevel, planGrid } = useStore(useShallow((s) => ({ project: s.project, set: s.set, presentRep: s.presentRep, groundElevation: s.groundElevation, selectedTower: s.selectedTower, boardView: s.boardView, planLevel: s.planLevel, planGrid: s.planGrid })))
  const towers = useTowers()
  const t = towers.find((x) => x.id === selectedTower) ?? towers[0]

  type Preset = { name: string; word: string; icon: LucideIcon; position: number[]; target: number[]; fov?: number }
  // Camera presets in the model frame (x, y, z-up). VTC: true north is 45 deg clockwise from the grid.
  const rad = (VTC_NORTH_DEG * Math.PI) / 180
  const south: [number, number] = [-Math.sin(rad), -Math.cos(rad)]
  // Axonometric: 6 deg lens from the isometric direction, far enough to frame the tower (near-parallel projection).
  const base = project === 'city' ? groundElevation : 0
  const axoDist = ((t?.height ?? 200) * 1.5) / (2 * Math.tan((3 * Math.PI) / 180))
  const iso = [Math.cos(Math.atan(1 / Math.SQRT2)) / Math.SQRT2, -Math.cos(Math.atan(1 / Math.SQRT2)) / Math.SQRT2, Math.sin(Math.atan(1 / Math.SQRT2))]
  const axo: Preset = { name: 'Axonometric (near-parallel)', word: 'Axo', icon: Cuboid, position: [(t?.x ?? 0) + iso[0] * axoDist, (t?.y ?? 0) + iso[1] * axoDist, base + (t?.height ?? 200) / 2 + iso[2] * axoDist], target: [t?.x ?? 0, t?.y ?? 0, base + (t?.height ?? 200) / 2], fov: 6 }
  const presets: Preset[] = project === 'vtc' ? [
    { name: 'Aerial', word: 'Aerial', icon: Globe, position: [380, -420, 520], target: [0, 0, 80] },
    // On the retail high street (y -64 to -40, between the heritage block and the site); y -75 was inside the heritage block.
    { name: 'Street: retail high street', word: 'Street', icon: PersonStanding, position: [10, -52, 1.6], target: [t?.x ?? 0, t?.y ?? 0, 60], fov: 60 },
    { name: 'Skyline from the south (toward QE Park)', word: 'Skyline', icon: Mountain, position: [south[0] * 3200, south[1] * 3200, 125], target: [0, 0, 150], fov: 28 },
    // The brief's suggested "mid-city view" (p.30): from inside the city, 700 m south-west and 90 m up (a mid-rise roof),
    // the tower against its neighbours. Camera choice is a team assumption (run-through G8, 4 Nov).
    { name: 'Mid-city view (700 m south-west, 90 m up)', word: 'Mid-city', icon: Building, position: [(t?.x ?? 0) - 500, (t?.y ?? 0) - 490, 90], target: [t?.x ?? 0, t?.y ?? 0, 120], fov: 40 },
    axo,
  ] : [
    { name: 'Aerial', word: 'Aerial', icon: Globe, position: [2600, -3600, 2400], target: [400, 200, 80] },
    { name: 'Tower close-up', word: 'Close-up', icon: Building2, position: [(t?.x ?? 0) + 400, (t?.y ?? 0) - 500, 300], target: [t?.x ?? 0, t?.y ?? 0, 80] },
    { name: 'Mid-city view (700 m south-west, 90 m up)', word: 'Mid-city', icon: Building, position: [(t?.x ?? 0) - 500, (t?.y ?? 0) - 490, base + 90], target: [t?.x ?? 0, t?.y ?? 0, base + 120], fov: 40 },
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

  const row = 'flex flex-wrap gap-0.5'
  return (
    <div>
      <Section title="Board" help="What the board shows: the 3D view, or a floor plan drawn to a standard scale. No names or logos on the boards (brief p.27).">
        <div role="radiogroup" aria-label="Board content" className={row}>
          <IconTile size="sm" role="radio" aria-checked={boardView === '3d'} active={boardView === '3d'} icon={Box} word="3D" label="3D view on the board" hint="The board shows the 3D view, framed as captured." onClick={() => set({ boardView: '3d' })} />
          <IconTile size="sm" role="radio" aria-checked={boardView === 'plan'} active={boardView === 'plan'} icon={LayoutPanelTop} word="Plan" label="Floor plan on the board" hint="The board shows a floor plan, drawn at the largest standard scale that fits A2." onClick={() => set({ boardView: 'plan' })} />
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
            <div className={row}>
              <IconTile size="sm" primary icon={Download} word="PNG" label="Download the plan as PNG" hint="The board frame as an image." onClick={() => captureShot(true)} />
              <IconTile size="sm" icon={FileDown} word="SVG" label="Download the plan as SVG, to scale" hint="Prints at the drawing's standard scale." onClick={() => downloadPlanSvg()} />
            </div>
            <p className="text-meta text-muted">No names or logos on the boards (brief p.27).</p>
          </div>
        )}
      </Section>
      {boardView === '3d' && <>
      <Section title="Representation" help="The model is locked in Present: change it in Massing or Schematic.">
        <div role="radiogroup" aria-label="Representation" className={row}>
          {REPS.map(({ id, label, icon, hint }) => (
            <IconTile key={id} size="sm" role="radio" aria-checked={presentRep === id} active={presentRep === id} icon={icon} word={label} label={label} hint={hint} onClick={() => set({ presentRep: id })} />
          ))}
          {project === 'city' && <CityStyle />}
        </div>
      </Section>
      <Section title="Camera" help={project === 'city' ? 'For a protected viewpoint, use "View from this viewpoint" in the view-cone results.' : undefined}>
        <div className={row}>
          {presets.map((p) => (
            <IconTile key={p.name} size="sm" icon={p.icon} word={p.word} label={p.name} hint="Moves the camera; capture when it looks right."
              onClick={() => set({ cameraRequest: { position: p.position as [number, number, number], target: p.target as [number, number, number], fov: p.fov } })} />
          ))}
        </div>
      </Section>
      </>}
      <Section title="Capture" help="The capture is the board frame (A2 landscape, 1.414:1), and each shot also collects in the strip on the left. A screen capture is about 1,000–1,500 px: use print size for images that fill a board.">
        <div className={row}>
          <IconTile size="sm" primary icon={Download} word="PNG" label="Capture and download (PNG)" hint="Saves the board frame as it is on screen." onClick={() => captureShot(true)} />
          {boardView === '3d' && <IconTile size="sm" icon={Camera} word="Print" label="Capture at print size (3508 px)" hint="Re-renders this camera at about 3500 px wide, enough for a full A2 board at 150 dpi." onClick={() => captureHiResShot()} />}
        </div>
      </Section>
      <DrawingsSection />
      <BoardsSection />
    </div>
  )
}

/** Real Vancouver's style for the board: Plain (pure tints by building type) or Context (Vista's textures). */
function CityStyle() {
  const style = useSceneStyle((s) => s.style)
  const opt = (id: SceneStyle, label: string, icon: LucideIcon, hint: string) => (
    <IconTile key={id} size="sm" role="radio" aria-checked={style === id} active={style === id} icon={icon} word={label} label={`${label} style`} hint={hint} onClick={() => useSceneStyle.setState({ style: id })} />
  )
  return (
    <div role="radiogroup" aria-label="Style" className="ml-1 flex gap-0.5 border-l border-line pl-1">
      {opt('plain', 'Plain', Square, 'Pure colours: existing buildings tinted by type.')}
      {opt('context', 'Context', Layers, "Vista's textures: facades, paving, asphalt, grass and water.")}
    </div>
  )
}
