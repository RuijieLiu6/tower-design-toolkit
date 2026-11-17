// The tool rail: a 48 px column on the model's edge with the step's design tools as icons, one per tool (Sinnie Choi's
// build of the Toolkit put the tools in one vertical column beside the view; Ruijie, 16 Nov: bring that layout into the
// main tool). Quick access beside the model, not a second panel: the same tools and the same open-tool state as the
// left panel (tools/toolPick.ts), so a click here opens the tool there and the two never disagree. On top, a grip, then
// the ways of editing on the model: Place (store.placing, key P), Move and Rotate (lib/towerEdit.ts, keys M and R) and,
// while the Massing tool is on the Form step, Face and Mass (lib/blockEdit.ts, key F); then the step's tools, a hairline
// between the groups. Each tile is the icon alone: the full name and what it does show on hover or focus, opening
// toward the model (IconTile.tsx); nothing is written beside the icons. The open tool and a mode that is on wear the
// interaction colour. A toolbar: the arrow keys move along it (roving tabindex), Enter or Space acts.
// Where it stands (Ruijie, 17 Nov: "control where it is placed with the mouse, and snap it, maybe to the right side as
// well"): the grip drags the rail as a floating ghost over the model, the two edges of the model region show as drop
// zones with the nearer one lit, and release snaps to the nearer edge with a short slide (none under reduced motion);
// Esc puts it back. On the grip, Left and Right (or Enter) move it without a pointer, announced in the live region.
// The rail keeps one place in the tree and moves by flex order, so dragging never remounts it. Side and hidden are
// remembered (lib/toolRail.ts); H hides and shows the rail; hidden, a small button on the remembered side brings it back.
// It has a column of its own beside the model region, so nothing drawn over the model (the tower's toolbar, the view
// strip, the north chip, the Layers tab) is ever under it, on either side. Massing and Schematic only (Present locks
// the model), on the guided route (App.tsx). In Presentation (17 Nov, lib/mode.ts) the rail shows that mode's own tools
// instead (camera, capture, drawings, boards, render) and no edit modes, since the model is locked there.
import { Fragment, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { Box, ChevronLeft, ChevronRight, Combine, Crosshair, Cuboid, Expand, Grid2x2, GripVertical, Minus, MousePointerClick, Move, RotateCw, Ruler, Scissors, Shapes, Spline, Square, Trash2, type LucideIcon } from './icons'
import { DRAW_TOOLS, setDrawTool, useDraw, type DrawTool } from '../lib/draw/drawStore'
import GlassIcon, { hueFor, ICON } from './GlassIcon'
import IconTile from './IconTile'
import { EDIT_MODES } from './MassingEditPanel'
import { shortName } from './tools/ToolPanel'
import { placeFirstTower } from './tools/NoTower'
import { useToolChoice } from './tools/toolPick'
import type { DesignTool } from './tools/registry'
import { useBlockEdit } from '../lib/blockEdit'
import { setToolRailSide, toggleToolRail, useToolRail, type RailSide } from '../lib/toolRail'
import { pickTower, toggleMode, useTowerEdit } from '../lib/towerEdit'
import { STEP_PHASE, designOf, usePhaseTools } from '../lib/workflow/phaseTools'
import { useStore, useTowers } from '../store'
import { isVisible, useUiItems, useUiVisibility, useUiVisible } from '../lib/ui/registry'
import { TOOL_ICONS, TOOL_WORDS } from '../data/icons'
import { captureShot } from '../lib/capture'
import { togglePanel, usePanels } from '../lib/panels'
import { setRightTab, useRightTab, type RightTab } from '../lib/rightTab'

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

/** A drag of the grip: the model region's box, the rail's size, the grab offset, the ghost's place and the nearer edge. */
interface Drag {
  pointerId: number
  box: { left: number; right: number; top: number; bottom: number }
  w: number; h: number
  ox: number; oy: number
  x: number; y: number
  near: RailSide
  /** Released: the ghost slides to the edge, then goes. */
  landing: boolean
}

const SLIDE_MS = 160
const railId = (key: string) => `tool-rail-${key.replace(/[^a-zA-Z0-9_-]/g, '-')}`
/** The drawing tools' glyphs (lib/draw/drawStore.ts), in the rail's own filled style; Move and Rotate are the modes' own tiles. */
const DRAW_ICONS: Record<DrawTool, LucideIcon> = { select: MousePointerClick, line: Spline, rect: Square, circle: Shapes, erase: Trash2, move: Move, copy: Grid2x2, rotate: RotateCw, offset: Expand, pull: Box, split: Scissors, bool: Combine, length: Minus, core: Cuboid, tape: Ruler }
const nearer = (d: Pick<Drag, 'box'>, x: number): RailSide => (x < (d.box.left + d.box.right) / 2 ? 'left' : 'right')

/** Presentation's own tools (17 Nov): the rail's list in that mode, where the model is locked and the design tools rest. */
const PRESENT_TOOLS: { id: 'camera' | 'capture' | 'drawings' | 'boards' | 'render'; label: string; hint: string; tab?: RightTab; act?: () => void }[] = [
  { id: 'camera', label: 'Camera: frame the view', hint: 'The view\'s height and angle and the board frame, in the Present tab on the right.', tab: 'present' },
  { id: 'capture', label: 'Capture the board frame', hint: 'A capture of the A2 board frame; each shot joins the strip in the left panel.', act: () => captureShot(false) },
  { id: 'drawings', label: 'Drawings', hint: 'Plans and sections drawn to a standard scale, in the Present tab.', tab: 'present' },
  { id: 'boards', label: 'Boards', hint: 'Compose the competition boards from the shots and drawings, in the Present tab.', tab: 'present' },
  { id: 'render', label: 'AI render', hint: 'An AI render from a shot, with its AI use on record, in the Render tab.', tab: 'render' },
]
const openRight = (tab: RightTab) => { setRightTab(tab); if (!usePanels.getState().right) togglePanel('right') }

/** One tile: the icon alone, the name and what it does beside it on hover or focus (IconTile.tsx). */
function RailTile({ item, side, tabStop, onFocus }: { item: RailItem; side: RailSide; tabStop: boolean; onFocus: () => void }) {
  const hint = useStore((s) => (typeof item.hint === 'function' ? item.hint(s) : item.hint))
  return (
    <IconTile layout="icon" tipSide={side === 'left' ? 'right' : 'left'} icon={item.icon} word={item.word} label={item.label} hint={hint} active={item.active}
      id={railId(item.key)} aria-pressed={item.active} disabled={item.disabled} tabIndex={tabStop ? 0 : -1} onFocus={onFocus} onClick={item.onPick} {...item.data} />
  )
}

export default function ToolRail() {
  const hidden = useToolRail((s) => s.hidden)
  const side = useToolRail((s) => s.side)
  const reduced = useStore((s) => s.reducedMotion)
  const { phase, step, shown, activeId, pick } = useToolChoice()
  const placing = useStore((s) => s.placing)
  const noTower = useTowers().length === 0
  const move = useTowerEdit((s) => s.move)
  const rotate = useTowerEdit((s) => s.rotate)
  const blockOn = useBlockEdit((s) => s.on)
  const blockMode = useBlockEdit((s) => s.mode)
  const rightTab = useRightTab((s) => s.tab)
  const drawTool = useDraw((s) => s.tool)
  const selectedDrawn = useStore((s) => !!s.towers[s.project].find((t) => t.id === s.selectedTower)?.drawn)
  const presentation = phase === 'present'
  const [focusAt, setFocusAt] = useState<string | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  // The Interface drawer (lib/ui/registry.ts): the rail itself, and each edit mode.
  const railOn = useUiVisible('tools.rail')
  const hiddenUi = useUiVisibility((s) => s.hidden)
  const uiItems = useUiItems()
  const rail = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

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
  const modes: RailItem[] = step === 'site' || presentation ? [] : [
    { key: 'mode:place', icon: Crosshair, word: 'Place', label: noTower ? 'Place a tower' : 'Place the tower', active: placing, data: { 'data-mode': 'place' },
      hint: noTower ? 'A starting tower on the site; then click the ground where it should stand.' : 'Then click the ground in the 3D view where it should stand; it moves there at once. Key: P.',
      onPick: () => { if (noTower) placeFirstTower(); else useStore.getState().set({ placing: !placing }) } },
    // One Move and one Rotate (17 Nov): a drawn mass is dragged with the drawing tool, a parametric tower with its gizmo.
    { key: 'mode:move', icon: Move, word: 'Move', label: 'Move the selected mass or tower', active: move || drawTool === 'move', disabled: noTower, data: { 'data-mode': 'move' },
      hint: 'A drawn mass: drag it (its building\'s parts move together). A tower: drag the arrows or the square, or type x and y in its toolbar. One undo step each. Key: M.',
      onPick: () => { if (selectedDrawn) { setDrawTool(drawTool === 'move' ? null : 'move'); return } if (drawTool) setDrawTool(null); withPick(() => toggleMode('move'))() } },
    { key: 'mode:rotate', icon: RotateCw, word: 'Rotate', label: 'Rotate the selected mass or tower', active: rotate || drawTool === 'rotate', disabled: noTower, data: { 'data-mode': 'rotate' },
      hint: 'A drawn mass: drag left or right, in 5° steps. A tower: drag the arc, or type the angle. Key: R.',
      onPick: () => { if (selectedDrawn) { setDrawTool(drawTool === 'rotate' ? null : 'rotate'); return } if (drawTool) setDrawTool(null); withPick(() => toggleMode('rotate'))() } },
    // Face and Mass belong to the Massing tool (Form step): picking one opens Massing when it is not open.
    ...(phase === 'basic' && !noTower && shown.some((t) => t.id === 'massing') ? EDIT_MODES.map((m): RailItem => ({
      key: `mode:${m.id}`, icon: m.id === 'face' ? Crosshair : Cuboid, word: m.label, label: `${m.label}: ${m.id === 'face' ? 'push or pull a face' : 'move a block'}`,
      hint: `${m.hint} Key: F.`, active: blockOn && blockMode === m.id, data: { 'data-mode': m.id },
      onPick: () => { useBlockEdit.setState({ mode: m.id, hover: null }); if (activeId !== 'massing') open('massing') },
    })) : []),
  ]
  const tools: RailItem[] = presentation
    ? PRESENT_TOOLS.map((t) => ({
      key: `tool:${t.id}`, icon: TOOL_ICONS[t.id], word: TOOL_WORDS[t.id], label: t.label, hint: t.hint, data: { 'data-tool': t.id },
      active: (t.id === 'boards' || t.id === 'render') && rightTab === t.tab, onPick: () => (t.act ? t.act() : openRight(t.tab!)),
    }))
    : shown.map((t) => ({
      key: `tool:${t.id}`, icon: t.icon, word: shortName(t), label: t.label, hint: t.hint, active: t.id === activeId, data: { 'data-tool': t.id }, onPick: () => open(t.id),
    }))
  // The drawing tools (Sinnie Choi's, lib/draw) on the Form step in Model, grouped as in her column; Move and Rotate are the modes' tiles.
  const drawing = phase === 'basic' && step === 'volume' && !presentation
  const drawGroups: RailItem[][] = drawing ? [1, 3, 4].map((g) => DRAW_TOOLS.filter((d) => (d.group === g || (g === 1 && d.group === 0) || (g === 3 && d.group === 2)) && d.id !== 'move' && d.id !== 'rotate').map((d): RailItem => ({
    key: `draw:${d.id}`, icon: DRAW_ICONS[d.id], word: d.word, label: d.label, hint: `${d.hint}${d.key ? ` Key: ${d.key}.` : ''}`, active: drawTool === d.id, data: { 'data-draw': d.id },
    onPick: () => setDrawTool(drawTool === d.id ? null : d.id),
  }))) : []
  const groups = [modes.filter((m) => isVisible(`tools.modes.${m.data['data-mode']}`, hiddenUi, uiItems)), ...drawGroups.map((g) => g.filter((d) => isVisible(`tools.draw.${d.data['data-draw']}`, hiddenUi, uiItems))), tools].filter((g) => g.length)
  const items = groups.flat()
  // Roving tabindex: the control last focused, else the open tool, else the grip; Up and Down (Home, End) move along the rail.
  const keys = ['grip', ...items.map((i) => i.key), 'hide']
  const tabStop = (keys.includes(focusAt ?? '') ? focusAt : null) ?? tools.find((i) => i.active)?.key ?? 'grip'
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

  // ---- where the rail stands
  const moveTo = (to: RailSide) => {
    if (to !== side) setToolRailSide(to)
    useStore.getState().set({ announce: `Tool rail on the ${to}` })
  }
  const onGripDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if ((e.pointerType === 'mouse' && e.button !== 0) || drag) return
    const main = rail.current?.parentElement
    if (!rail.current || !main) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    const r = rail.current.getBoundingClientRect(), m = main.getBoundingClientRect()
    setDrag({ pointerId: e.pointerId, box: { left: m.left, right: m.right, top: m.top, bottom: m.bottom }, w: r.width, h: r.height, ox: e.clientX - r.left, oy: e.clientY - r.top, x: r.left, y: r.top, near: side, landing: false })
  }
  const onGripMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    setDrag((d) => (d && !d.landing && d.pointerId === e.pointerId ? { ...d, x: e.clientX - d.ox, y: e.clientY - d.oy, near: nearer(d, e.clientX) } : d))
  }
  const onGripUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!drag || drag.landing || drag.pointerId !== e.pointerId) return
    moveTo(drag.near)
    if (reduced) { setDrag(null); return }
    // The ghost slides to the edge it snapped to (the rail is already there), then goes.
    setDrag({ ...drag, landing: true, x: drag.near === 'left' ? drag.box.left : drag.box.right - drag.w, y: drag.box.top })
    timer.current = setTimeout(() => setDrag(null), SLIDE_MS + 20)
  }
  const cancelDrag = () => setDrag((d) => (d && !d.landing ? null : d))
  useEffect(() => {
    if (!drag || drag.landing) return
    const key = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); cancelDrag() } }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [drag])
  const onGripKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault(); e.stopPropagation()
    moveTo(e.key === 'ArrowLeft' ? 'left' : e.key === 'ArrowRight' ? 'right' : side === 'left' ? 'right' : 'left')
  }

  const place = side === 'left' ? 'order-first' : 'order-last'
  if (!railOn) return null
  if (hidden) {
    const Icon = side === 'left' ? ChevronRight : ChevronLeft
    return (
      <button type="button" onClick={toggleToolRail} aria-label="Show the tool rail (H)" aria-keyshortcuts="H" title="Show the tool rail (H)" data-testid="tool-rail-show" data-side={side}
        className={`glass-edge ${place} flex h-10 w-5 shrink-0 items-center justify-center self-start rounded-lg bg-panel text-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-accent`}>
        <Icon size={14} aria-hidden />
      </button>
    )
  }
  const HideIcon = side === 'left' ? ChevronLeft : ChevronRight
  return (
    <>
      <div ref={rail} role="toolbar" aria-label="Design tools" aria-orientation="vertical" data-testid="tool-rail" data-side={side} onKeyDown={onKey}
        className={`glass-edge ${place} flex w-12 shrink-0 flex-col items-center gap-1 overflow-y-auto overflow-x-hidden rounded-2xl bg-panel py-1.5 [scrollbar-width:none] ${drag ? 'opacity-40' : ''}`}>
        {/* The grip: drag the rail to either side of the model; Left and Right (or Enter) do the same from the keyboard. */}
        <button type="button" id={railId('grip')} onFocus={() => setFocusAt('grip')} tabIndex={tabStop === 'grip' ? 0 : -1}
          aria-label="Move the tool rail" aria-keyshortcuts="ArrowLeft ArrowRight" title={`Move the tool rail: drag it to the other side of the model, or press ${side === 'left' ? 'Right' : 'Left'}`}
          data-testid="tool-rail-grip" data-side={side}
          onPointerDown={onGripDown} onPointerMove={onGripMove} onPointerUp={onGripUp} onPointerCancel={cancelDrag} onKeyDown={onGripKey}
          className="flex h-6 w-7 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted outline-none hover:bg-black/5 hover:text-ink focus-visible:ring-2 focus-visible:ring-accent active:cursor-grabbing">
          <GripVertical size={14} aria-hidden />
        </button>
        {groups.map((g, gi) => (
          <Fragment key={gi}>
            {gi > 0 && <span role="separator" aria-orientation="horizontal" className="my-0.5 h-px w-7 shrink-0 bg-line" />}
            {g.map((item) => <RailTile key={item.key} item={item} side={side} tabStop={tabStop === item.key} onFocus={() => setFocusAt(item.key)} />)}
          </Fragment>
        ))}
        {/* The pointer's way to hide the rail (H from the keyboard). */}
        <button type="button" id={railId('hide')} onClick={toggleToolRail} onFocus={() => setFocusAt('hide')} tabIndex={tabStop === 'hide' ? 0 : -1}
          aria-label="Hide the tool rail (H)" aria-keyshortcuts="H" title="Hide the tool rail (H)"
          className="mt-auto flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted outline-none hover:bg-black/5 hover:text-ink focus-visible:ring-2 focus-visible:ring-accent">
          <HideIcon size={14} aria-hidden />
        </button>
      </div>
      {drag && createPortal(
        <>
          {/* The two edges of the model region as drop zones, the nearer one lit in the interaction colour. */}
          {(['left', 'right'] as RailSide[]).map((s) => (
            <div key={s} aria-hidden data-drop={s} data-near={drag.near === s ? '' : undefined}
              style={{ position: 'fixed', left: s === 'left' ? drag.box.left : drag.box.right - drag.w, top: drag.box.top, width: drag.w, height: drag.box.bottom - drag.box.top, zIndex: 999 }}
              className={`pointer-events-none rounded-2xl border-2 border-dashed ${drag.near === s ? 'border-accent bg-accent/10' : 'border-line'}`} />
          ))}
          {/* The rail as a ghost under the pointer; on release it slides to the edge. */}
          <div aria-hidden data-testid="tool-rail-ghost" data-landing={drag.landing ? '' : undefined}
            style={{ position: 'fixed', left: drag.x, top: drag.y, width: drag.w, height: drag.h, zIndex: 1000, transition: drag.landing && !reduced ? `left ${SLIDE_MS}ms ease-out, top ${SLIDE_MS}ms ease-out` : undefined }}
            className="glass-edge pointer-events-none flex flex-col items-center gap-1 overflow-hidden rounded-2xl bg-panel py-1.5 opacity-90 shadow-lg">
            <span className="flex h-6 w-7 shrink-0 items-center justify-center text-muted"><GripVertical size={14} aria-hidden /></span>
            {groups.map((g, gi) => (
              <Fragment key={gi}>
                {gi > 0 && <span className="my-0.5 h-px w-7 shrink-0 bg-line" />}
                {g.map((item) => <span key={item.key} className="flex h-10 w-10 shrink-0 items-center justify-center"><GlassIcon icon={item.icon} hue={hueFor(item.word)} size={ICON.tool} level={item.active ? 'on' : 'soft'} /></span>)}
              </Fragment>
            ))}
          </div>
        </>, document.body)}
    </>
  )
}
