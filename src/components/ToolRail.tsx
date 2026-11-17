// The tool rail: a 48 px column on the model's left edge with the step's design tools as icons, one per tool (Sinnie
// Choi's build of the Toolkit put the tools in one vertical column beside the view; Ruijie, 16 Nov: bring that layout
// into the main tool). Quick access beside the model, not a second panel: the same tools and the same open-tool state
// as the left panel (tools/toolPick.ts), so a click here opens the tool there and the two never disagree. On top, the
// ways of editing on the model: Place (store.placing, key P), Move and Rotate (lib/towerEdit.ts, keys M and R) and, while
// the Massing tool is on the Form step, Face and Mass (lib/blockEdit.ts, key F); then the step's tools, a hairline
// between the groups. Each tile is the icon alone: the full name and what it does show on hover or focus (IconTile.tsx);
// nothing is written beside the icons. The open tool and a mode that is on wear the interaction colour. A toolbar: the
// arrow keys move along it (roving tabindex), Enter or Space acts. H hides and shows the rail (lib/toolRail.ts,
// remembered in this browser); hidden, a small button at the model's edge brings it back. Massing and Schematic only
// (Present locks the model), on the guided route (App.tsx).
import { Fragment, useState, type KeyboardEvent } from 'react'
import { ChevronLeft, ChevronRight, Crosshair, Cuboid, Move, RotateCw, type LucideIcon } from './icons'
import IconTile from './IconTile'
import { EDIT_MODES } from './MassingEditPanel'
import { shortName } from './tools/ToolPanel'
import { placeFirstTower } from './tools/NoTower'
import { useToolChoice } from './tools/toolPick'
import type { DesignTool } from './tools/registry'
import { useBlockEdit } from '../lib/blockEdit'
import { toggleToolRail, useToolRail } from '../lib/toolRail'
import { pickTower, toggleMode, useTowerEdit } from '../lib/towerEdit'
import { STEP_PHASE, designOf, usePhaseTools } from '../lib/workflow/phaseTools'
import { useStore, useTowers } from '../store'

interface RailItem {
  key: string
  icon: LucideIcon
  word: string
  label: string
  hint?: DesignTool['hint']
  active: boolean
  disabled?: boolean
  onPick: () => void
  data: Record<`data-${string}`, string>
}

const railId = (key: string) => `tool-rail-${key.replace(/[^a-zA-Z0-9_-]/g, '-')}`

/** One tile: the icon alone, the name and what it does beside it on hover or focus (IconTile.tsx). */
function RailTile({ item, tabStop, onFocus }: { item: RailItem; tabStop: boolean; onFocus: () => void }) {
  const hint = useStore((s) => (typeof item.hint === 'function' ? item.hint(s) : item.hint))
  return (
    <IconTile layout="icon" tipSide="right" icon={item.icon} word={item.word} label={item.label} hint={hint} active={item.active}
      id={railId(item.key)} aria-pressed={item.active} disabled={item.disabled} tabIndex={tabStop ? 0 : -1} onFocus={onFocus} onClick={item.onPick} {...item.data} />
  )
}

export default function ToolRail() {
  const hidden = useToolRail((s) => s.hidden)
  const { phase, step, shown, activeId, pick } = useToolChoice()
  const placing = useStore((s) => s.placing)
  const noTower = useTowers().length === 0
  const move = useTowerEdit((s) => s.move)
  const rotate = useTowerEdit((s) => s.rotate)
  const blockOn = useBlockEdit((s) => s.on)
  const blockMode = useBlockEdit((s) => s.mode)
  const [focusAt, setFocusAt] = useState<string | null>(null)

  // Open a tool: in the panel too (its phase row shows the design tools, not a check's settings), then the tool itself.
  const open = (id: string) => {
    const phaseId = STEP_PHASE[step], design = designOf(phaseId).id
    if (usePhaseTools.getState().active[phaseId] !== design) usePhaseTools.getState().setActive(phaseId, design)
    pick(id)
  }
  // Move and Rotate act on the picked tower (the gizmo); from the rail, the selected tower is picked first.
  const withPick = (fn: () => void) => () => {
    const s = useStore.getState()
    if (!useTowerEdit.getState().picked && s.selectedTower) pickTower(s.selectedTower)
    fn()
  }

  // The ways of editing on the model, past the Site step (the site tools are not edits of a tower).
  const modes: RailItem[] = step === 'site' ? [] : [
    { key: 'mode:place', icon: Crosshair, word: 'Place', label: noTower ? 'Place a tower' : 'Place the tower', active: placing, data: { 'data-mode': 'place' },
      hint: noTower ? 'A starting tower on the site; then click the ground where it should stand.' : 'Then click the ground in the 3D view where it should stand; it moves there at once. Key: P.',
      onPick: () => { if (noTower) placeFirstTower(); else useStore.getState().set({ placing: !placing }) } },
    { key: 'mode:move', icon: Move, word: 'Move', label: 'Move the tower', active: move, disabled: noTower, data: { 'data-mode': 'move' },
      hint: 'Drag the arrows or the square in the 3D view, or type x and y in the tower\'s toolbar. A move applies at once; Ctrl+Z undoes it. Key: M.',
      onPick: withPick(() => toggleMode('move')) },
    { key: 'mode:rotate', icon: RotateCw, word: 'Rotate', label: 'Rotate the tower', active: rotate, disabled: noTower, data: { 'data-mode': 'rotate' },
      hint: 'Drag the arc in the 3D view, or type the angle (counter-clockwise, about the tower\'s centre). Key: R.',
      onPick: withPick(() => toggleMode('rotate')) },
    // Face and Mass belong to the Massing tool (Form step): picking one opens Massing when it is not open.
    ...(phase === 'basic' && !noTower && shown.some((t) => t.id === 'massing') ? EDIT_MODES.map((m): RailItem => ({
      key: `mode:${m.id}`, icon: m.id === 'face' ? Crosshair : Cuboid, word: m.label, label: `${m.label}: ${m.id === 'face' ? 'push or pull a face' : 'move a block'}`,
      hint: `${m.hint} Key: F.`, active: blockOn && blockMode === m.id, data: { 'data-mode': m.id },
      onPick: () => { useBlockEdit.setState({ mode: m.id, hover: null }); if (activeId !== 'massing') open('massing') },
    })) : []),
  ]
  const tools: RailItem[] = shown.map((t) => ({
    key: `tool:${t.id}`, icon: t.icon, word: shortName(t), label: t.label, hint: t.hint, active: t.id === activeId, data: { 'data-tool': t.id }, onPick: () => open(t.id),
  }))
  const groups = [modes, tools].filter((g) => g.length)
  const items = groups.flat()
  // Roving tabindex: the tile last focused, else the open tool, else the first; the arrow keys move along the rail.
  const tabStop = (items.some((i) => i.key === focusAt) ? focusAt : null) ?? tools.find((i) => i.active)?.key ?? items[0]?.key ?? 'hide'
  const keys = [...items.map((i) => i.key), 'hide']
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const id = (e.target as HTMLElement).id
    const i = keys.findIndex((k) => railId(k) === id)
    const j = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? keys.length - 1 : null
    if (j === null || i < 0) return
    e.preventDefault()
    const next = keys[(j + keys.length) % keys.length]
    setFocusAt(next)
    document.getElementById(railId(next))?.focus()
  }

  if (hidden) {
    return (
      <button type="button" onClick={toggleToolRail} aria-label="Show the tool rail (H)" aria-keyshortcuts="H" title="Show the tool rail (H)" data-testid="tool-rail-show"
        className="glass-edge flex h-10 w-5 shrink-0 items-center justify-center self-start rounded-lg bg-panel text-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-accent">
        <ChevronRight size={14} aria-hidden />
      </button>
    )
  }
  return (
    <div role="toolbar" aria-label="Design tools" aria-orientation="vertical" data-testid="tool-rail" onKeyDown={onKey}
      className="glass-edge flex w-12 shrink-0 flex-col items-center gap-1 overflow-y-auto overflow-x-hidden rounded-2xl bg-panel py-1.5 [scrollbar-width:none]">
      {groups.map((g, gi) => (
        <Fragment key={gi}>
          {gi > 0 && <span role="separator" aria-orientation="horizontal" className="my-0.5 h-px w-7 shrink-0 bg-line" />}
          {g.map((item) => <RailTile key={item.key} item={item} tabStop={tabStop === item.key} onFocus={() => setFocusAt(item.key)} />)}
        </Fragment>
      ))}
      {/* The pointer's way to hide the rail (H from the keyboard). */}
      <button type="button" id={railId('hide')} onClick={toggleToolRail} onFocus={() => setFocusAt('hide')} tabIndex={tabStop === 'hide' ? 0 : -1}
        aria-label="Hide the tool rail (H)" aria-keyshortcuts="H" title="Hide the tool rail (H)"
        className="mt-auto flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted outline-none hover:bg-black/5 hover:text-ink focus-visible:ring-2 focus-visible:ring-accent">
        <ChevronLeft size={14} aria-hidden />
      </button>
    </div>
  )
}
