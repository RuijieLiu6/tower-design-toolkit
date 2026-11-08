// The guided app's design tools (left panel). Each export is one tool's body; the tool definitions that place them in the
// panel are in tools/builtin.tool.tsx.
import { useEffect, type ReactNode } from 'react'
import { useTowerPosition } from '../lib/towerPosition'
import { ArrowDown, ArrowUp, Building2, Crosshair, Expand, Layers, Move, Plus, Ruler, Scissors, Sparkles, Square, Trash2 } from './icons'
import { PROGRAM_ICONS } from '../data/icons'
import { DEFAULT_EGRESS_PRESETS, PLACEMENT_LABEL, type EgressPresets } from '../engine/egress'
import { stablePostedLimit } from '../engine/skyRoom'
import { DEFAULT_LIFT_PRESETS, suggestSkyLobby, type LiftPresets } from '../engine/lifts'
import { coreSide, towerFloors } from '../engine/massing'
import { USES, type SkyRoom, type StairPlacement, type UseId } from '../engine/types'
import { TIER_LABEL, type FsrTier } from '../engine/vtcRules'
import { useResults } from '../hooks/useResults'
import { DEFAULT_SKY_ROOM, useStore, useTowers } from '../store'
import BlockEditor from './BlockEditor'
import FsrSiteLine from './FsrSiteLine'
import ImportedPanel from './ImportedPanel'
import PublicRealmPanel from './PublicRealmPanel'
import { FlagChip, NumberField, Section, Toggle } from './ui'
import Fold from './Fold'
import IconTile from './IconTile'
import { useShallow } from 'zustand/react/shallow'
import Help from './Help'
import { GenerateFold, MassingEditCard, useMassingEditSession } from './MassingEditPanel'

function ProgramIcon({ use, small = false }: { use: UseId; small?: boolean }) {
  const Icon = PROGRAM_ICONS[use]
  return <span className={`flex shrink-0 items-center justify-center rounded text-white ${small ? 'h-4 w-4' : 'h-5 w-5'}`} style={{ background: USES[use].color }} title={USES[use].label}><Icon size={small ? 10 : 12} /></span>
}

/** Core & lift check presets. All are team assumptions or placeholders; the sources each one leans on are in research P11. */
const LIFT_FIELDS: { key: keyof LiftPresets; label: string; unit?: string; step: number; scale?: number; hint: string }[] = [
  { key: 'officeM2PerPerson', label: 'Office area per person', unit: 'm²', step: 0.5, hint: 'Stopes (22 Bishopsgate): 1 per 10 expected; UQ uses 12' },
  { key: 'utilisation', label: 'Office occupants present at peak', unit: '%', step: 1, scale: 100, hint: '22 Bishopsgate used 80%' },
  { key: 'personsPerHome', label: 'Persons per home', step: 0.1, hint: 'Arup used 1.5–4.0 by bedroom count' },
  { key: 'homeM2', label: 'Net area per home', unit: 'm²', step: 1, hint: 'Estimates the home count until units are tagged' },
  { key: 'hotelM2PerKey', label: 'Net area per hotel key', unit: 'm²', step: 1, hint: 'Team assumption' },
  { key: 'maxFloorsPerRise', label: 'Most floors per rise', step: 1, hint: 'CIBSE Guide D via Peters: up to 15' },
  { key: 'carPersons', label: 'Persons per car', step: 1, hint: '1600 kg / 21 persons, an EN 81 placeholder' },
  { key: 'shaftM2', label: 'Passenger shaft footprint', unit: 'm²', step: 0.1, hint: 'Team assumption' },
  { key: 'serviceCoreM2', label: 'Service and firefighter lifts', unit: 'm²', step: 1, hint: 'Team assumption, with lobbies' },
  { key: 'servicesM2', label: 'Risers, services, washrooms', unit: 'm²', step: 1, hint: 'Team assumption; exit stairs now come from the egress check' },
  { key: 'wallAllowance', label: 'Core walls allowance', unit: '%', step: 1, scale: 100, hint: 'Team assumption until the structure module sizes the walls' },
  { key: 'firefighterSpeed', label: 'Firefighter lift speed', unit: 'm/s', step: 0.5, hint: 'Team assumption; the by-law needs a 1 min run to the top floor' },
]

function LiftPresetFields({ presets, onChange }: { presets: LiftPresets; onChange: (patch: Partial<LiftPresets>) => void }) {
  return (
    <details className="rounded-md border border-line">
      <summary className="cursor-pointer px-2 py-1.5 text-xs text-muted hover:text-ink">Lift presets (core &amp; lift check)</summary>
      <div className="grid grid-cols-2 gap-2 border-t border-line p-2">
        {LIFT_FIELDS.map((f) => (
          <NumberField key={f.key} label={f.label} unit={f.unit} step={f.step} hint={f.hint}
            value={presets[f.key] * (f.scale ?? 1)} onChange={(v) => onChange({ [f.key]: Math.max(f.key === 'wallAllowance' ? 0 : f.key === 'utilisation' ? 0.05 : 0.1, v / (f.scale ?? 1)) })} />
        ))}
        <div className="col-span-2 flex items-center gap-1"><FlagChip flag="team_assumption" />
          <button onClick={() => onChange(DEFAULT_LIFT_PRESETS)} className="ml-auto text-meta text-accent hover:underline">Reset presets</button>
        </div>
      </div>
    </details>
  )
}

/** Tiny plan glyph: plate, core and the two stairs. */
function StairGlyph({ placement }: { placement: StairPlacement }) {
  const spots = placement === 'core' ? [[8, 8], [12, 12]] : placement === 'mixed' ? [[8, 8], [17, 17]] : [[3, 3], [17, 17]]
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" aria-hidden>
      <rect x="1" y="1" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <rect x="6.5" y="6.5" width="7" height="7" fill="currentColor" opacity="0.25" />
      {spots.map(([x, y], i) => <rect key={i} x={x - 2} y={y - 2} width="4" height="4" fill="#c0504d" />)}
    </svg>
  )
}

function EgressPresetFields({ presets, onChange }: { presets: EgressPresets; onChange: (patch: Partial<EgressPresets>) => void }) {
  return (
    <details className="rounded-md border border-line">
      <summary className="cursor-pointer px-2 py-1.5 text-xs text-muted hover:text-ink">Egress presets (exit stairs)</summary>
      <div className="grid grid-cols-2 gap-2 border-t border-line p-2">
        <NumberField label="Exit stairs per floor" value={presets.stairs} onChange={(v) => onChange({ stairs: Math.max(2, Math.round(v)) })} step={1} hint="At least two (VBBL 3.4.2.1)" />
        <NumberField label="Bedrooms per home" value={presets.bedroomsPerHome} onChange={(v) => onChange({ bedroomsPerHome: Math.max(0.5, v) })} step={0.1} hint="2 persons per sleeping room (VBBL 3.1.17.1)" />
        <NumberField label="Riser" unit="mm" value={Math.round(presets.riser * 1000)} onChange={(v) => onChange({ riser: Math.max(100, v) / 1000 })} step={5} hint="At most 180 mm keeps the 8 mm per person rate" />
        <NumberField label="Tread" unit="mm" value={Math.round(presets.tread * 1000)} onChange={(v) => onChange({ tread: Math.max(200, v) / 1000 })} step={5} hint="At least 280 mm keeps the 8 mm per person rate" />
        <NumberField label="Amenity floors, m² per person" value={presets.amenityFactor} onChange={(v) => onChange({ amenityFactor: Math.max(0.3, v) })} step={0.1} hint="4.6 personal services until programmed; 1.2 dining; 0.4 standing (VBBL Table 3.1.17.1)" />
        <span className="self-end pb-1 text-meta text-muted">4.6 until programmed · 1.2 dining · 0.4 standing</span>
        <label className="col-span-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={presets.officeCorridor} onChange={() => onChange({ officeCorridor: !presets.officeCorridor })} />Office floors have a public corridor (exits then need only be 9 m apart)</label>
        <div className="col-span-2 flex items-center gap-1"><FlagChip flag="team_assumption" />
          <button onClick={() => onChange(DEFAULT_EGRESS_PRESETS)} className="ml-auto text-meta text-accent hover:underline">Reset presets</button>
        </div>
      </div>
    </details>
  )
}

/** Settings of the public sky room; every one is a team assumption (research P06-M07, P11-M02). */
function SkyRoomFields({ room, onChange, suggested }: { room: SkyRoom; onChange: (patch: Partial<SkyRoom>) => void; suggested: { limit: number; widthMm: number } | null }) {
  const seg = (on: boolean) => `flex-1 rounded px-2 py-1 text-meta ${on ? 'bg-panel font-semibold text-ink ring-1 ring-line' : 'text-muted hover:text-ink'}`
  return (
    <div className="mt-1.5 grid gap-2 rounded-md border border-[#8e5ba8]/40 bg-[#8e5ba8]/[0.05] p-2">
      <div className="flex items-center gap-1.5 text-xs font-medium text-[#6d3f8a]"><Sparkles size={13} />Public sky room at level {room.level}</div>
      <div className="flex rounded-md bg-black/5 p-0.5" role="radiogroup" aria-label="Visitor lifts">
        <button role="radio" aria-checked={room.access === 'shared'} onClick={() => onChange({ access: 'shared' })} className={seg(room.access === 'shared')}>Share the tenant shuttle</button>
        <button role="radio" aria-checked={room.access === 'dedicated'} onClick={() => onChange({ access: 'dedicated' })} className={seg(room.access === 'dedicated')}>Own public lifts</button>
      </div>
      <div className="flex rounded-md bg-black/5 p-0.5" role="radiogroup" aria-label="Visitor occupant load">
        <button role="radio" aria-checked={room.loadBasis === 'dining'} onClick={() => onChange({ loadBasis: 'dining' })} className={seg(room.loadBasis === 'dining')}>Tables (1.2 m² each)</button>
        <button role="radio" aria-checked={room.loadBasis === 'standing'} onClick={() => onChange({ loadBasis: 'standing' })} className={seg(room.loadBasis === 'standing')}>Standing (0.4 m² each)</button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <NumberField label="Visitor area" unit="%" value={Math.round(room.visitorShare * 100)} onChange={(v) => onChange({ visitorShare: Math.min(1, Math.max(0.05, v / 100)) })} step={5} hint="Share of the floor's net area open to visitors" />
        <NumberField label="Visit" unit="min" value={room.visitMinutes} onChange={(v) => onChange({ visitMinutes: Math.max(10, Math.round(v)) })} step={5} hint="Average visit length" />
        <NumberField label="Open" unit="h/day" value={room.hoursOpen} onChange={(v) => onChange({ hoursOpen: Math.min(24, Math.max(0, v)) })} step={1} hint="Hours open per day" />
      </div>
      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={room.free} onChange={() => onChange({ free: !room.free })} />Free to enter</label>
      <div className="grid gap-1">
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={room.postedLimit != null} onChange={() => onChange({ postedLimit: room.postedLimit != null ? null : Math.max(1, suggested?.limit ?? 200) })} />
          Post an occupant limit
        </label>
        {room.postedLimit != null && (
          <NumberField label="Posted limit (visitors in the room)" unit="people" value={room.postedLimit} onChange={(v) => onChange({ postedLimit: Math.max(0, Math.round(v)) })} step={10}
            hint="Needs a sign, managed entry and the building official's acceptance" />
        )}
        {suggested && (room.postedLimit == null || Math.abs(room.postedLimit - suggested.limit) > 1) && (
          suggested.limit > 0
            ? <button onClick={() => onChange({ postedLimit: suggested.limit })} className="justify-self-start text-left text-meta text-accent hover:underline">
                Post {suggested.limit} visitors: the room then needs no wider stairs than the other floors ({Math.round(suggested.widthMm)} mm)
              </button>
            : <span className="text-meta text-muted">The rest of this floor alone needs wider stairs than the other floors: give the room a larger share of the floor.</span>
        )}
      </div>
      <div className="flex items-center gap-1"><FlagChip flag="team_assumption" /><span className="text-meta text-muted">The 1997 Higher Buildings Policy asks for a public deck or amenity where possible; sizes, hours and visitor numbers are team presets.</span></div>
    </div>
  )
}

/** The tower the design tools edit: the selected one, or the first. */
function useEditedTower() {
  const towers = useTowers()
  const selectedTower = useStore((s) => s.selectedTower)
  const updateTower = useStore((s) => s.updateTower)
  const t = towers.find((x) => x.id === selectedTower) ?? towers[0]
  const up = (patch: Parameters<typeof updateTower>[1]) => { if (t) updateTower(t.id, patch) }
  return { t, towers, up }
}

/** A block inside a design tool: an optional small heading, then the controls. */
export function ToolBlock({ title, right, help, children }: { title?: string; right?: ReactNode; help?: ReactNode; children: ReactNode }) {
  return (
    <div className="border-b border-line px-4 py-3 last:border-b-0">
      {(title || right) && (
        <div className="mb-2 flex items-center justify-between gap-2">
          {title && <h4 className="flex items-center gap-1.5 text-meta font-semibold text-muted">{title}{help && <Help label={`About ${title}`}>{help}</Help>}</h4>}
          {right}
        </div>
      )}
      {children}
    </div>
  )
}

/** Which tower the other tools are editing (they all follow the Place towers selection). */
function EditingTag({ name }: { name: string }) {
  return <p className="mb-2 text-meta text-muted">Editing <span className="font-semibold text-ink">{name}</span> · pick another tower under Place</p>
}

/** Towers: pick, add, place and remove towers; the site's ground level in Real Vancouver. Importing is on the Site step. */
export function TowersTool() {
  // Open = the Tower position session: the view locks on the site, towers drag on the ground, Properties on the right.
  useEffect(() => { useTowerPosition.setState({ on: true, locked: true }); return () => useTowerPosition.setState({ on: false }) }, [])
  const { t, towers } = useEditedTower()
  const { project, selectTower, addTower, removeTower, placing, set, groundElevation, groundMode } = useStore(useShallow((s) => ({ project: s.project, selectTower: s.selectTower, addTower: s.addTower, removeTower: s.removeTower, placing: s.placing, set: s.set, groundElevation: s.groundElevation, groundMode: s.groundMode })))
  if (!t) return null
  return (
    <>
      <ToolBlock title="Towers">
        <div className="flex flex-wrap gap-1">
          {towers.map((x) => (
            <button key={x.id} onClick={() => selectTower(x.id)} aria-pressed={x.id === t.id} className={`rounded-md border px-2 py-1 text-xs ${x.id === t.id ? 'border-accent bg-accent/10 text-accent' : 'border-line text-muted hover:text-ink'}`}>{x.name}</button>
          ))}
        </div>
        {/* Add, Move and Delete side by side, at one level (Ruijie, 6 Nov), as icons with a key word like every tool. */}
        <div role="group" aria-label="Tower actions" className="mt-2 flex flex-wrap gap-0.5">
          <IconTile size="sm" icon={Plus} word="Add" label="Add tower" onClick={addTower} hint="A new tower next to the last one, 30 m lower and without a podium." />
          <IconTile size="sm" icon={placing ? Crosshair : Move} word="Move" label={`Move ${t.name}`} active={placing} aria-pressed={placing} onClick={() => set({ placing: !placing })}
            hint={placing ? 'Click the ground in the 3D view where it should stand; it moves there at once. Esc stops.' : 'Then click the ground in the 3D view where it should stand. Key: P.'} />
          <IconTile size="sm" icon={Trash2} word="Delete" label={`Delete ${t.name}`} onClick={() => removeTower(t.id)} hint="Undo brings it back." />
        </div>
      </ToolBlock>
      {project === 'city' && (
        <ToolBlock title="Site">
          <NumberField label="Ground elevation at the site (geodetic)" value={groundElevation} onChange={(v) => set({ groundElevation: v, groundMode: 'manual' })} unit="m"
            hint={groundMode === 'terrain'
              ? 'From the terrain under the selected tower (City LiDAR 2022 or MRDEM-30, CGVD28; unverified). Typing a value sets it by hand.'
              : 'Set by hand (team assumption). The Ground card can switch it back to the terrain.'} />
        </ToolBlock>
      )}
    </>
  )
}

/** Massing: height, rotation, floor-to-floor, the stacked blocks and the podium use (or the imported model). */
export function MassingTool() {
  const { t, up } = useEditedTower()
  // Open = the view edits the tower (Sinnie Choi's Face / Mass, components/MassingEdit3D.tsx).
  useMassingEditSession()
  if (!t) return null
  if (t.imported) return <><ImportedPanel t={t} /><GenerateFold /></>
  const floors = towerFloors(t)
  return (
    <>
    <ToolBlock>
      <EditingTag name={t.name} />
      <div className="grid gap-2.5">
        <MassingEditCard t={t} />
        <NumberField label="Height (architectural top)" value={t.height} onChange={(v) => up({ height: v })} min={60} max={420} step={1} unit="m" />
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Rotation (whole tower)" value={t.rotation} onChange={(v) => up({ rotation: v })} unit="°" />
          <NumberField label="Floor-to-floor" value={t.f2f} onChange={(v) => up({ f2f: Math.max(2.8, v) })} step={0.1} unit="m" />
        </div>
        <BlockEditor t={t} />
        {/* A generated podium can hold a use per block (retail at grade, office above); picking one use here sets them all. */}
        <label className="flex items-center justify-between text-xs"><span className="text-muted">Podium use{t.blocks?.some((b) => b.podium && b.use) ? ' (mixed: set by block)' : ''}</span>
          <select value={t.podiumUse} onChange={(e) => up({ podiumUse: e.target.value as UseId, ...(t.blocks?.some((b) => b.use) ? { blocks: t.blocks.map((b) => ({ ...b, use: undefined })) } : {}) })} className="rounded border border-line bg-panel px-1.5 py-1 text-xs">
            {Object.entries(USES).map(([id, u]) => <option key={id} value={id}>{u.label}</option>)}
          </select>
        </label>
        {/* The tower in figures, as icon stats (Ruijie, 6 Nov: information as graphics and icons, not a sentence). */}
        <dl className="grid grid-cols-2 gap-1 text-meta" aria-label="The tower in figures" data-testid="massing-stats">
          <Stat icon={Layers} label="Floors" value={String(floors.length)} />
          <Stat icon={Building2} label="Gross area" value={`${Math.round(floors.reduce((a, f) => a + f.area, 0)).toLocaleString('en-CA')} m²`} />
          <Stat icon={Square} label="Typical plate" value={`${(t.width * t.depth).toFixed(0)} m²`} />
          {t.podiumHeight > 0 && <Stat icon={Ruler} label="Podium" value={`${t.podiumHeight.toFixed(1)} m`} />}
        </dl>
      </div>
    </ToolBlock>
    <GenerateFold />
    </>
  )
}

/** Program: uses by floor band, the gross floor area by use and the FSR, and which uses count toward 9.0 (competition). */
export function ProgramTool() {
  const { t, up } = useEditedTower()
  const { project, fsrTier, set } = useStore(useShallow((s) => ({ project: s.project, fsrTier: s.fsrTier, set: s.set })))
  const { fsr } = useResults()
  if (!t) return null
  const setBand = (i: number, patch: Partial<{ use: UseId; share: number }>) => up({ bands: t.bands.map((b, k) => (k === i ? { ...b, ...patch } : b)) })
  const moveBand = (i: number, d: number) => { const b = [...t.bands]; const j = i + d; if (j < 0 || j >= b.length) return; [b[i], b[j]] = [b[j], b[i]]; up({ bands: b }) }
  const shareTotal = t.bands.reduce((s, b) => s + b.share, 0) || 1
  const maxGfa = Math.max(...Object.values(fsr.gfa), 1)
  return (
    <>
      {!t.imported && (
        <ToolBlock title={`Bands, bottom → top · ${t.name}`} right={<button onClick={() => up({ bands: [...t.bands, { use: 'office', share: 0.1 }] })} className="flex items-center gap-1 text-meta text-accent hover:underline"><Plus size={12} />Band</button>}>
          <div className="grid gap-1.5">
            {t.bands.map((b, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <ProgramIcon use={b.use} />
                <select value={b.use} onChange={(e) => setBand(i, { use: e.target.value as UseId })} className="w-32 rounded border border-line bg-panel px-1 py-0.5 text-meta" aria-label={`Band ${i + 1} use`}>
                  {Object.entries(USES).map(([id, u]) => <option key={id} value={id}>{u.label}</option>)}
                </select>
                <input type="range" min={0} max={1} step={0.01} value={b.share} onChange={(e) => setBand(i, { share: Number(e.target.value) })} className="w-full accent-accent" aria-label={`Band ${i + 1} share`} />
                <span className="w-9 text-right text-meta tabular-nums text-muted">{Math.round((b.share / shareTotal) * 100)}%</span>
                <button onClick={() => moveBand(i, -1)} aria-label="Move band down" className="text-muted hover:text-ink"><ArrowDown size={12} /></button>
                <button onClick={() => moveBand(i, 1)} aria-label="Move band up" className="text-muted hover:text-ink"><ArrowUp size={12} /></button>
                <button onClick={() => up({ bands: t.bands.filter((_, k) => k !== i) })} aria-label="Remove band" className="text-muted hover:text-red-700"><Trash2 size={12} /></button>
              </div>
            ))}
          </div>
        </ToolBlock>
      )}
      <Section title="Floor area (all towers, gross)">
        <div className="grid gap-1">
          {Object.entries(fsr.gfa).filter(([, v]) => v > 0).map(([u, v]) => (
            <div key={u} className="flex items-center gap-2 text-meta">
              <ProgramIcon use={u as UseId} small />
              <span className="w-24 truncate text-muted">{USES[u as UseId].label}</span>
              <div className="h-2 flex-1 rounded bg-slate-100"><div className="h-2 rounded" style={{ width: `${(v / maxGfa) * 100}%`, background: USES[u as UseId].color }} /></div>
              <span className="w-20 text-right tabular-nums">{Math.round(v).toLocaleString()} m²</span>
            </div>
          ))}
          <FsrSiteLine totalFsr={fsr.totalFsr} siteArea={fsr.siteArea} tiers={[fsr.tier1, fsr.tier2, fsr.tier3]} />
        </div>
      </Section>
      {project === 'vtc' && (
        <ToolBlock>
          <label className="flex flex-col gap-1 text-xs"><span className="text-muted">Which uses count toward the 9.0 non-residential FSR <FlagChip flag="team_assumption" /></span>
            <select value={fsrTier} onChange={(e) => set({ fsrTier: Number(e.target.value) as FsrTier })} className="rounded border border-line px-1.5 py-1">
              {([1, 2, 3] as FsrTier[]).map((k) => <option key={k} value={k}>{TIER_LABEL[k]}</option>)}
            </select>
          </label>
        </ToolBlock>
      )}
    </>
  )
}

/** Ground & public realm: streetwall, frontage and open-space inputs (both projects), and the competition's transit link. */
export function GroundTool() {
  const { transitLink, set, project } = useStore(useShallow((s) => ({ transitLink: s.transitLink, set: s.set, project: s.project })))
  // Real Vancouver (7 Nov): the study site's streets, frontage, link and station entrance; the brief's transit link is the competition's.
  if (project === 'city') return <PublicRealmPanel />
  return (
    <>
      <PublicRealmPanel />
      <ToolBlock>
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={transitLink} onChange={() => set({ transitLink: !transitLink })} /> Below-grade link to the transit station is designed</label>
      </ToolBlock>
    </>
  )
}

/** Sun & time: the date and hour the shadow preview and sun-based views use. */
export function SunTool() {
  const { sun, set, enabled, toggleNode } = useStore(useShallow((s) => ({ sun: s.sun, set: s.set, enabled: s.enabled, toggleNode: s.toggleNode })))
  return (
    <ToolBlock>
      <div className="grid grid-cols-3 gap-2">
        <NumberField label="Month" value={sun.month} onChange={(v) => set({ sun: { ...sun, month: Math.min(12, Math.max(1, Math.round(v))) } })} />
        <NumberField label="Day" value={sun.day} onChange={(v) => set({ sun: { ...sun, day: Math.min(31, Math.max(1, Math.round(v))) } })} />
        <NumberField label="Hour" value={sun.hour} onChange={(v) => set({ sun: { ...sun, hour: Math.min(21, Math.max(5, v)) } })} step={0.25} />
        <input type="range" min={5} max={21} step={0.25} value={sun.hour} onChange={(e) => set({ sun: { ...sun, hour: Number(e.target.value) } })} className="col-span-3 accent-accent" aria-label="Time of day" />
      </div>
      {!enabled['built.sun'] && (
        <button onClick={() => toggleNode('built.sun')} className="mt-2 text-left text-meta text-accent hover:underline">Show the shadows: switch on “Sun &amp; shadow preview”</button>
      )}
    </ToolBlock>
  )
}

/** Core & floors (Schematic): core share, plant floors, sky lobbies and the sky room, exit stairs, section and explode. */
export function CoreTool() {
  const { t, up } = useEditedTower()
  const { set, sectionOn, sectionLevel, explode, liftPresets, setLiftPresets, egressPresets, setEgressPresets } = useStore(useShallow((s) => ({ set: s.set, sectionOn: s.sectionOn, sectionLevel: s.sectionLevel, explode: s.explode, liftPresets: s.liftPresets, setLiftPresets: s.setLiftPresets, egressPresets: s.egressPresets, setEgressPresets: s.setEgressPresets })))
  const { lifts } = useResults()
  if (!t) return null
  const floors = towerFloors(t)
  const plantFloors = floors.filter((f) => f.use === 'mechanical' && !f.podium).length
  const top = floors.length ? floors[floors.length - 1].z1 : t.height
  const lift = lifts.find((l) => l.tower.id === t.id)
  const sky = t.skyLobbies ?? []
  const towerOnly = floors.filter((f) => !f.podium && f.z0 > 0.5)
  const minSky = (towerOnly[3] ?? towerOnly[0])?.level ?? 1, maxSky = (towerOnly[towerOnly.length - 4] ?? towerOnly[towerOnly.length - 1])?.level ?? 1
  const suggestion = sky.length < 3 ? suggestSkyLobby(t) : null
  const setSky = (i: number, lv: number) => {
    const old = sky[i], nl = Math.min(maxSky, Math.max(minSky, Math.round(lv)))
    up({ skyLobbies: [...new Set(sky.map((x, k) => (k === i ? nl : x)))].sort((a, b) => a - b), ...(t.skyRoom?.level === old ? { skyRoom: { ...t.skyRoom, level: nl } } : {}) })
  }
  const togglePublic = (lv: number) => up({ skyRoom: t.skyRoom?.level === lv ? null : { ...DEFAULT_SKY_ROOM, ...(t.skyRoom ?? {}), level: lv } })

  return (
    <ToolBlock>
      <EditingTag name={t.name} />
      <div className="grid gap-2.5">
        <div>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="font-medium">Core</span>
            <span className="flex items-center gap-1.5 text-meta text-muted"><Toggle checked={!!t.coreAuto} onChange={() => up({ coreAuto: !t.coreAuto })} label="Size the core to the lifts" />Size to the lifts</span>
          </div>
          <NumberField label={t.coreAuto ? 'Share of the tower plate: follows the lifts (drag to set by hand)' : 'Share of the tower plate: set by hand'} value={Math.round(t.coreShare * 1000) / 10}
            onChange={(v) => up({ coreShare: Math.min(0.6, Math.max(0.05, v / 100)) })} min={5} max={60} step={0.5} unit="%" />
        </div>
        <NumberField label="Plant floor every N tower floors (0 = none)" value={t.plantEvery} onChange={(v) => up({ plantEvery: Math.max(0, Math.round(v)) })} min={0} max={40} step={1} />
        <div>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 font-medium">Sky lobbies<Help label="About sky lobbies">A sky lobby puts the upper rises on shuttles, so their shafts stop running through the floors below.</Help></span>
            {suggestion !== null && <button onClick={() => up({ skyLobbies: [...sky, suggestion].sort((a, b) => a - b) })} className="flex items-center gap-1 text-meta text-accent hover:underline"><Plus size={12} />Add at level {suggestion}</button>}
          </div>
          {sky.length === 0 && <p className="text-meta text-muted">None: every rise runs from the ground lobby.</p>}
          <div className="grid gap-1">
            {sky.map((lv, i) => (
              <div key={`${i}-${lv}`} className="flex items-center gap-2 text-xs">
                <span className="rounded bg-[#6cc0b8] px-1.5 py-0.5 text-meta font-semibold text-white">S{i + 1}</span>
                <label className="flex items-center gap-1 text-muted">Level
                  <input type="number" defaultValue={lv} min={minSky} max={maxSky} onBlur={(e) => setSky(i, Number(e.target.value))} onKeyDown={(e) => { if (e.key === 'Enter') setSky(i, Number((e.target as HTMLInputElement).value)) }}
                    className="w-14 rounded border border-line bg-panel px-1.5 py-0.5 text-ink tabular-nums" aria-label={`Sky lobby ${i + 1} level`} />
                </label>
                <span className="text-meta text-muted">+{Math.round(floors.find((f) => f.level === lv)?.z0 ?? 0)} m</span>
                <span className="ml-auto flex items-center gap-1 text-meta text-muted"><Toggle checked={t.skyRoom?.level === lv} onChange={() => togglePublic(lv)} label={`Public sky room at level ${lv}`} />Public</span>
                <button onClick={() => up({ skyLobbies: sky.filter((_, k) => k !== i) })} aria-label={`Remove sky lobby at level ${lv}`} className="text-muted hover:text-red-700"><Trash2 size={12} /></button>
              </div>
            ))}
          </div>
          {t.skyRoom && <SkyRoomFields room={t.skyRoom} onChange={(patch) => up({ skyRoom: { ...t.skyRoom!, ...patch } })} suggested={stablePostedLimit(t, liftPresets, egressPresets)} />}
          {sky.length > 0 && <div className="mt-1 flex items-center gap-1"><FlagChip flag="team_assumption" /><span className="text-meta text-muted">The sky lobby floor counts as public amenity; people above it change lifts once.{!t.skyRoom ? ' Switch one to Public to open it as a sky room.' : ''}</span></div>}
        </div>
        <div className="grid grid-cols-2 gap-2 rounded-md bg-black/[0.03] p-2 text-meta">
          <div><div className="text-muted">Core modelled</div><div className="font-semibold tabular-nums">{Math.round(t.coreShare * t.width * t.depth)} m² · {coreSide(t).toFixed(1)} m sq</div></div>
          {lift && <div><div className="text-muted">Lifts and stairs need</div><div className={`font-semibold tabular-nums ${lift.requiredMax > lift.modelledCore + 0.5 ? 'text-red-700' : ''}`}>{Math.round(lift.requiredMax)} m² · {lift.totalCars} cars</div></div>}
          {lift && <div><div className="text-muted">Net-to-gross</div><div className="font-semibold tabular-nums">{Math.round(lift.ntg * 100)}%</div></div>}
          <div><div className="text-muted">Plant floors</div><div className="font-semibold tabular-nums">{plantFloors}</div></div>
        </div>
        <div className="flex items-start gap-1"><FlagChip flag="team_assumption" /><Fold summary="Team assumptions, not code minimums">Core share, plant spacing and the lift and egress presets are team assumptions, not code minimums. Net-to-gross uses the larger of the modelled and needed core.</Fold></div>
        <div>
          <div className="mb-1 flex items-center gap-1.5 text-xs font-medium">Exit stairs<Help label="About exit stair placement">Stairs at the plate edge pass exit separation more easily and shrink the core, but take lettable floor and facade. Placement is a team assumption on geometry.</Help></div>
          <div className="flex rounded-md bg-black/5 p-0.5" role="radiogroup" aria-label="Exit stair placement">
            {(['core', 'mixed', 'perimeter'] as StairPlacement[]).map((k) => {
              const on = (t.stairPlacement ?? 'core') === k
              return (
                <button key={k} role="radio" aria-checked={on} title={PLACEMENT_LABEL[k]} onClick={() => up({ stairPlacement: k })}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded px-1.5 py-1 text-meta ${on ? 'bg-panel font-semibold text-ink ring-1 ring-line' : 'text-muted hover:text-ink'}`}>
                  <StairGlyph placement={k} />{k === 'core' ? 'In the core' : k === 'mixed' ? 'Core + edge' : 'At the edges'}
                </button>
              )
            })}
          </div>
        </div>
        {/* Views of the model in the 3D viewport, as icons with a key word like every tool (Ruijie, 6 Nov). */}
        <div className="flex gap-0.5">
          <IconTile size="sm" icon={Scissors} word="Section" label="Section cut" active={sectionOn} aria-pressed={sectionOn} onClick={() => set({ sectionOn: !sectionOn, explode: false })}
            hint="Cuts the tower at a height in the 3D view to show the plate, core and stairs; set the height below." />
          <IconTile size="sm" icon={Expand} word="Explode" label="Explode zones" active={explode} aria-pressed={explode} onClick={() => set({ explode: !explode, sectionOn: false })}
            hint="Pulls the use zones apart in the 3D view to show what sits where." />
        </div>
        {sectionOn && <NumberField label="Cut height above grade" value={sectionLevel} onChange={(v) => set({ sectionLevel: Math.min(top - 1, Math.max(1, v)) })} min={1} max={Math.max(2, Math.floor(top - 1))} step={1} unit="m" />}
        <LiftPresetFields presets={liftPresets} onChange={setLiftPresets} />
        <EgressPresetFields presets={egressPresets} onChange={setEgressPresets} />
      </div>
    </ToolBlock>
  )
}

/** One figure with its icon: the label under the value, small. */
function Stat({ icon: Icon, label, value }: { icon: typeof Layers; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 rounded-md border border-line px-1.5 py-1">
      <Icon size={14} className="shrink-0 text-accent" aria-hidden />
      <div className="flex min-w-0 flex-col-reverse leading-tight"><dt className="text-meta text-muted">{label}</dt><dd className="font-semibold tabular-nums text-ink">{value}</dd></div>
    </div>
  )
}
