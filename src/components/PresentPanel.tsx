// Present's panel (Ruijie, 6 Nov: tools as icons with a key word, long text behind "?"): the board (3D view or floor
// plan), the representation, camera presets and capture, each an icon tile with its full name on hover (IconTile.tsx).
import { Box, Building, Building2, Camera, Cuboid, Download, Globe, Mountain, PersonStanding, ScanEye, type LucideIcon } from './icons'
import { VTC_NORTH_DEG } from '../context'
import { captureShot } from '../lib/capture'
import { useStore, useTowers, type Representation } from '../store'
import { useEffect } from 'react'
import { captureHiResShot } from '../lib/hiresCapture'
import { Section } from './ui'
import { useShallow } from 'zustand/react/shallow'
import { DisplayModeSwitch } from './DisplayModeSwitch'
import IconTile from './IconTile'

export default function PresentPanel() {
  const { project, set, presentRep, groundElevation, selectedTower, boardView } = useStore(useShallow((s) => ({ project: s.project, set: s.set, presentRep: s.presentRep, groundElevation: s.groundElevation, selectedTower: s.selectedTower, boardView: s.boardView })))
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

  const row = 'flex flex-wrap gap-0.5'
  // 18 Nov (Sinnie: "combine/merge functions … right now there's repeating functions"): this is the Views tab of the
  // Presentation page. Floor plans and the other drawings go on the sheets from Add (true-scale vectors), the board
  // status is Check and export, and captures land in the sheet Library; so the board is always the 3D view here.
  useEffect(() => { if (boardView !== '3d') set({ boardView: '3d' }) }, [boardView, set])
  return (
    <div>
      <Section title="Representation" help="The model is locked in Present: change it in Form or Schematic.">
        <div role="radiogroup" aria-label="Representation" className={row}>
          {REPS.map(({ id, label, icon, hint }) => (
            <IconTile key={id} size="sm" role="radio" aria-checked={presentRep === id} active={presentRep === id} icon={icon} word={label} label={label} hint={hint} onClick={() => set({ presentRep: id })} />
          ))}
        </div>
        {/* The display mode the board shows (Massing, Program, Analysis, Materials): the same switch as over the view,
            which Present hides. Real Vancouver's Plain / Context picker that sat here is its Massing / Materials. */}
        <div className="mt-1.5"><DisplayModeSwitch project={project} /></div>
      </Section>
      <Section title="Camera" help={project === 'city' ? 'For a protected viewpoint, use "View from this viewpoint" in the view-cone results.' : undefined}>
        <div className={row}>
          {presets.map((p) => (
            <IconTile key={p.name} size="sm" icon={p.icon} word={p.word} label={p.name} hint="Moves the camera; capture when it looks right."
              onClick={() => set({ cameraRequest: { position: p.position as [number, number, number], target: p.target as [number, number, number], fov: p.fov } })} />
          ))}
        </div>
      </Section>
      <Section title="Capture" help="The capture is the board frame (A2 landscape, 1.414:1). Each shot goes to the sheet Library under Compose, ready to drag onto a sheet. A screen capture is about 1,000–1,500 px: use print size for images that fill a board.">
        <div className={row}>
          <IconTile size="sm" primary icon={Download} word="PNG" label={boardView === '3d' ? 'Capture and download (PNG)' : 'Download the plan as PNG'} hint={boardView === '3d' ? 'Saves the board frame as it is on screen.' : 'The board frame, with the plan, as an image.'} onClick={() => captureShot(true)} />
          {boardView === '3d' && <IconTile size="sm" icon={Camera} word="Print" label="Capture at print size (3508 px)" hint="Re-renders this camera at about 3500 px wide, enough for a full A2 board at 150 dpi." onClick={() => captureHiResShot()} />}
        </div>
      </Section>
    </div>
  )
}
