// The designer-friendly workflow builder (Result A, Ruijie's Block 2, 9 Nov): the project bar's "Edit workflow" opens it
// over the whole workspace; tools are added from the library (asking first), moved by their handle, by the card menu and
// by Alt+Arrow, given return paths ("↻ Return to …"), undone and redone; Apply keeps the changes and Discard puts the
// opening workflow back. The model, the step, the open tool and the camera context stay through every edit, and the
// saved process survives a reload. The 14 acceptance checks of BLOCK2-workflow-builder.md §12 are walked in order in the
// first test (1–12), then the missing-input state (13), the missing custom-tool reference (14), the keyboard trap check
// and the 1280 × 800 size (no clipped primary actions) on their own pages.
//
// The city model is slow in the headless shell (SwiftShader), so every wait is generous and the config runs one worker.
// Test ids are the builder's contract (04 Tool Plan/workflow-builder/DECISIONS-result-a.md and the integrator's brief).
import { expect, test, type Locator, type Page } from '@playwright/test'
import { openDesignTool, placeStartingTower } from './helpers'

test.describe.configure({ mode: 'serial' })
test.use({ actionTimeout: 30_000 })

// ---------- the pieces of the screen ----------
const rail = (p: Page) => p.getByRole('navigation', { name: 'Design process' })
const panel = (p: Page) => p.getByTestId('phase-panel')
const builder = (p: Page) => p.getByTestId('workflow-builder')
const card = (p: Page, id: string) => builder(p).getByTestId(`card-${id}`)
const chip = (p: Page) => builder(p).getByTestId('return-chip-built.sun-design.massing')
/** The phase panel's rows for the open phase, in working order. */
const rows = (p: Page) => panel(p).locator('[data-phase-node]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.phaseNode))
/** The main sequence of the builder, in order (the cards with a position marker). */
const run = (p: Page) => builder(p).locator('[data-card][data-lane="main"]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.card))
const towerCount = async (p: Page) => {
  await p.getByRole('tab', { name: 'Your site' }).click().catch(() => {})
  return p.getByText(/Towers on this site/).first()
}

// ---------- a saved project workflow, seeded before the app starts ----------
type Edge = { a: string; b: string }
/** The five design steps in order: an existing project's workflow (check 1), so the builder opens with cards to work on. */
const DESIGN_STEPS = ['design.site', 'design.massing', 'design.program', 'design.plates', 'design.frame']

/**
 * Lands on the guided app (the landing page skipped, the onboarding seen) with a saved workflow in this browser: the
 * landing record (ts.coverWorkflow, v1) and the running one (ts.workflowRun) with the same run, so the restore in
 * lib/coverWorkflow.ts takes the saved board whatever the clock says. `nodes: null` leaves the browser empty (a first
 * visit, no workflow saved).
 */
async function seed(p: Page, wf: { nodes: string[]; edges?: Edge[]; name?: string } | null) {
  await p.addInitScript((wf) => {
    performance.setResourceTimingBufferSize(10_000)
    try {
      localStorage.setItem('ts.landing.skip', '0')
      localStorage.setItem('ts.onboarding.seen', '1')
      // once per tab: a reload must keep what the app saved (addInitScript runs again on every navigation)
      if (wf && !sessionStorage.getItem('e2e-seeded')) {
        sessionStorage.setItem('e2e-seeded', '1')
        const edges = wf.edges ?? ['start', ...wf.nodes, 'enter'].slice(0, -1).map((a, i) => ({ a, b: ['start', ...wf.nodes, 'enter'][i + 1] }))
        const savedAt = new Date().toISOString()
        localStorage.setItem('ts.coverWorkflow', JSON.stringify({ v: 1, role: 'custom', presetId: null, customName: wf.name ?? 'Test', nodes: wf.nodes, edges, at: {}, savedAt }))
        localStorage.setItem('ts.workflowRun', JSON.stringify({ name: wf.name ?? 'Test', nodes: wf.nodes, id: null, type: null, at: savedAt }))
      }
    } catch { /* ignore: the app shows its defaults */ }
  }, wf)
}

/** Opens the guided app on the competition site; places the starting tower (Form step stays open) unless told not to. */
async function openProject(p: Page, { tower = true } = {}) {
  await p.goto('/#/guided')
  await rail(p).waitFor({ timeout: 120_000 })
  await p.getByRole('tab', { name: 'Competition site' }).click({ timeout: 120_000 })
  if (tower) await placeStartingTower(p, { stay: true })
}

/** The project bar's Edit workflow button opens the builder (wired to openBuilder by the integrator). */
async function openBuilder(p: Page) {
  await p.getByTestId('edit-workflow-button').click({ timeout: 60_000 })
  await expect(builder(p)).toBeVisible({ timeout: 30_000 })
  await expect(builder(p)).toHaveAttribute('role', 'dialog')
}

/**
 * The towers of the open project, straight from the store (the module is imported by its dev-server URL, as
 * designTools.e2e.ts does): the evidence that selecting, moving and removing cards never touches the model.
 */
type Tower = { id: string; height: number; x: number; y: number; rotation: number }
async function towers(p: Page): Promise<Tower[]> {
  return p.evaluate(async () => {
    const url = performance.getEntriesByType('resource').map((e) => e.name).filter((n) => /\/src\/store\.ts/.test(n)).pop()!
    const { useStore } = await import(/* @vite-ignore */ url)
    const s = useStore.getState()
    return (s.towers[s.project] as Record<string, number | string>[]).map((t) => ({ id: t.id, height: t.height, x: t.x, y: t.y, rotation: t.rotation })) as Tower[]
  })
}

/** Press on the handle, move in steps to the target (reading its place once the drag is on), check it lights up, release. */
async function dragHandleTo(p: Page, handle: Locator, slot: Locator) {
  await handle.hover() // a handle may be shown on hover only (progressive disclosure)
  await expect(handle).toBeVisible()
  const h = (await handle.boundingBox())!
  const from = { x: h.x + h.width / 2, y: h.y + h.height / 2 }
  await p.mouse.move(from.x, from.y)
  await p.mouse.down()
  await p.mouse.move(from.x + 6, from.y + 2) // the drag starts: slots become visible targets
  await expect(slot).toBeVisible()
  const s = (await slot.boundingBox())!
  const to = { x: s.x + s.width / 2, y: s.y + s.height / 2 }
  for (let k = 1; k <= 10; k++) await p.mouse.move(from.x + ((to.x - from.x) * k) / 10, from.y + ((to.y - from.y) * k) / 10)
  await expect(slot).toHaveAttribute('data-over', '')
  await p.mouse.up()
}

/** Opens a card's menu and clicks one of its items. */
async function menu(p: Page, id: string, item: 'card-move-before' | 'card-move-after' | 'card-return' | 'card-remove') {
  await builder(p).getByTestId(`card-menu-${id}`).click()
  await builder(p).getByTestId(item).click()
}

const SUN_TO_MASSING = 'built.sun>design.massing'

test('1–12 · open, add, drag, move, return path, undo/redo, apply, open tool, design change, reload, discard', async ({ page: p }) => {
  test.setTimeout(480_000)
  await seed(p, { nodes: DESIGN_STEPS, name: 'Test' })
  await openProject(p)
  // Where the user is before the builder opens: the Form step, one tower, its geometry as placed.
  await expect(rail(p).locator('[aria-current="step"]')).toHaveAttribute('data-step', 'volume')
  await expect(await towerCount(p)).toContainText('(1)')
  const model0 = await towers(p)
  expect(model0).toHaveLength(1)

  // 1 · an existing project and its workflow: the five design steps as numbered cards, nothing selected, the inspector
  // shows the workflow (its name, the phases it includes)
  await openBuilder(p)
  const b = builder(p)
  await expect(b).toHaveAttribute('aria-label', 'Workflow builder')
  await expect(b.getByTestId('builder-header')).toBeVisible()
  await expect(b.getByTestId('builder-name')).toHaveText(/Test/)
  await expect(b.getByTestId('tool-library')).toBeVisible()
  await expect(b.getByTestId('workflow-sequence')).toBeVisible()
  await expect(b.getByTestId('workflow-inspector')).toBeVisible()
  await expect(b.getByTestId('inspector-workflow')).toBeVisible()
  await expect(b.getByTestId('builder-continue')).toBeVisible() // nothing changed yet
  await expect(b.getByTestId('builder-apply')).toHaveCount(0)
  await expect.poll(() => run(p)).toEqual(DESIGN_STEPS)
  await expect(card(p, 'design.massing').getByTestId('card-index-design.massing')).toHaveText(/2/)
  await expect(b.getByTestId('builder-advanced')).toBeVisible() // the data graph stays reachable, in the advanced area
  // the one-line description can be put away; the preset list opens and closes without choosing
  await expect(b.getByTestId('builder-intro')).toBeVisible()
  await b.getByTestId('builder-intro-hide').click()
  await expect(b.getByTestId('builder-intro')).toHaveCount(0)
  await b.getByTestId('builder-preset').click()
  await expect(b.locator('[data-preset]').first()).toBeVisible()
  await p.keyboard.press('Escape')
  await expect(b.locator('[data-preset]')).toHaveCount(0)
  await expect(b).toBeVisible() // Esc closed the list, not the builder
  // selecting a card is only a selection: the inspector follows, the model does not move
  await card(p, 'design.massing').click()
  await expect(card(p, 'design.massing')).toHaveAttribute('aria-current', 'true')
  await expect(b.getByTestId('inspector-title')).toContainText('Massing')
  await expect(b.getByTestId('inspector-phase')).toContainText('Form')
  await expect(b.getByTestId('inspector-state')).toBeVisible()
  await expect(b.getByTestId('inspector-uses')).toBeVisible()
  await expect(b.getByTestId('inspector-produces')).toBeVisible()
  await expect(b.getByTestId('card-summary-design.massing')).toContainText('1 tower') // a real summary from the project
  expect(await towers(p)).toEqual(model0)
  await expect(b.getByTestId('builder-continue')).toBeVisible()

  // 2 · add an available tool: Sun & shadow from the library; the insertion is shown and asked first
  const lib = b.getByTestId('tool-library')
  await lib.getByTestId('library-search').fill('sun')
  await expect(lib.getByTestId('library-entry-built.sun')).toBeVisible()
  await expect(lib.getByTestId('library-add-built.sun')).toHaveText('Add')
  await lib.getByTestId('library-add-built.sun').click()
  const pending = b.getByTestId('pending-add')
  await expect(pending).toBeVisible()
  await expect(pending.getByTestId('add-confirm')).toHaveAttribute('data-add-id', 'built.sun')
  await expect(pending.getByTestId('pending-after')).toBeVisible() // the position can be changed before saying yes
  await expect(card(p, 'built.sun')).toHaveCount(0) // nothing is added until yes
  await pending.getByTestId('add-confirm-yes').click()
  await expect(card(p, 'built.sun')).toBeVisible()
  await expect(card(p, 'built.sun')).toHaveAttribute('data-lane', 'main')
  await expect(b.getByTestId('card-state-built.sun')).toHaveAttribute('data-state', /^(ready|paused)$/) // Sun runs without a tower; never a result
  await expect(b.getByTestId('builder-apply')).toBeVisible()
  await expect(b.getByTestId('builder-discard')).toBeVisible()
  await expect(b.getByTestId('builder-continue')).toHaveCount(0)
  // once in the workflow, a tool is never added twice: Add becomes Show, which selects its card
  await expect(lib.getByTestId('library-add-built.sun')).toHaveText('Show')
  await lib.getByTestId('library-add-built.sun').click()
  await expect(card(p, 'built.sun')).toHaveAttribute('aria-current', 'true')
  await expect(b.locator('[data-card="built.sun"]')).toHaveCount(1)
  await lib.getByTestId('library-search').fill('')

  // 3 · reorder by dragging: the handle to the slot after Site (before Massing); the slot lights up under the pointer
  await dragHandleTo(p, b.getByTestId('card-handle-built.sun'), b.getByTestId('slot-design.site'))
  await expect.poll(() => run(p)).toEqual(['design.site', 'built.sun', 'design.massing', 'design.program', 'design.plates', 'design.frame'])
  await expect(b.getByTestId('sequence-note')).toContainText(/moved/i)
  expect(await towers(p)).toEqual(model0) // reordering never touches the geometry

  // 4 · reorder without dragging: the card menu's Move after / Move before, and Alt+Arrow on the handle
  await menu(p, 'built.sun', 'card-move-after')
  await expect.poll(() => run(p)).toEqual(['design.site', 'design.massing', 'built.sun', 'design.program', 'design.plates', 'design.frame'])
  await menu(p, 'built.sun', 'card-move-before')
  await expect.poll(() => run(p)).toEqual(['design.site', 'built.sun', 'design.massing', 'design.program', 'design.plates', 'design.frame'])
  await b.getByTestId('card-handle-built.sun').focus()
  await p.keyboard.press('Alt+ArrowRight')
  await expect.poll(() => run(p)).toEqual(['design.site', 'design.massing', 'built.sun', 'design.program', 'design.plates', 'design.frame'])
  // the menu closes on Esc without doing anything
  await b.getByTestId('card-menu-built.sun').click()
  await expect(b.getByTestId('card-remove')).toBeVisible()
  await p.keyboard.press('Escape')
  await expect(b.getByTestId('card-remove')).toHaveCount(0)
  await expect(b).toBeVisible()

  // 5 · a return path: Sun & shadow ↻ Massing (only earlier cards are offered); the chip, the arc and the inspector say so
  await menu(p, 'built.sun', 'card-return')
  const chooser = b.getByTestId('return-chooser')
  await expect(chooser).toBeVisible()
  await expect(chooser.getByTestId('return-to-design.massing')).toBeVisible()
  await expect(chooser.getByTestId('return-to-design.site')).toBeVisible()
  await expect(chooser.getByTestId('return-to-design.program')).toHaveCount(0) // later in the run: not a return
  await chooser.getByTestId('return-to-design.massing').click()
  await expect(chip(p)).toBeVisible()
  await expect(chip(p)).toContainText('Return to Massing')
  await expect(b.locator(`[data-return="${SUN_TO_MASSING}"]`)).toHaveCount(1)
  await card(p, 'built.sun').click()
  await expect(b.getByTestId('inspector-returns')).toContainText('Massing')
  await expect.poll(() => run(p)).toEqual(['design.site', 'design.massing', 'built.sun', 'design.program', 'design.plates', 'design.frame']) // the forward route is kept

  // 6 · undo and redo: the return path goes and comes back; the order stays
  await b.getByTestId('builder-undo').click()
  await expect(chip(p)).toHaveCount(0)
  await expect(b.locator(`[data-return="${SUN_TO_MASSING}"]`)).toHaveCount(0)
  await b.getByTestId('builder-redo').click()
  await expect(chip(p)).toBeVisible()
  await expect.poll(() => run(p)).toEqual(['design.site', 'design.massing', 'built.sun', 'design.program', 'design.plates', 'design.frame'])
  expect(await towers(p)).toEqual(model0)

  // 7 · apply: the builder closes; the Form panel shows Sun & shadow with its ↻; the step, the tower and the model are as before
  await b.getByTestId('builder-apply').click()
  await expect(builder(p)).toHaveCount(0)
  await expect(rail(p).locator('[aria-current="step"]')).toHaveAttribute('data-step', 'volume')
  await expect(panel(p)).toHaveAttribute('data-phase', 'form')
  await expect(panel(p).locator('[data-phase-node="built.sun"]')).toBeVisible()
  await expect.poll(() => rows(p)).toEqual(['design.massing', 'built.sun'])
  await expect(panel(p).locator(`[data-return="${SUN_TO_MASSING}"]`)).toHaveCount(1)
  await expect(await towerCount(p)).toContainText('(1)')
  expect(await towers(p)).toEqual(model0)

  // 8 · open the tool in the design workspace from its card: the builder closes on Form with Sun & shadow open
  await openBuilder(p)
  await expect(card(p, 'built.sun')).toBeVisible()
  await b.getByTestId('card-open-built.sun').click()
  await expect(builder(p)).toHaveCount(0)
  await expect(panel(p)).toHaveAttribute('data-phase', 'form')
  await expect(panel(p).getByTestId('phase-active')).toHaveAttribute('data-active', 'built.sun')
  await expect(panel(p).getByTestId('phase-active').getByText('Month')).toBeVisible() // its real controls, not a result card

  // 9 · a real design change: the Massing tool's height field (components/DesignPanel.tsx, NumberField "Height
  // (architectural top)"); the store shows the new height. Skipped with a note if the field is not on this build.
  await openDesignTool(p, 'massing')
  // the number field, not the range beside it (Playwright cannot fill a range input)
  const exact = p.getByLabel('Height (architectural top) value', { exact: true })
  const height = (await exact.count()) ? exact : p.locator('input[type="number"][aria-label*="eight" i]').first()
  if (await height.isVisible({ timeout: 10_000 }).catch(() => false)) {
    const h0 = model0[0].height
    await height.fill(String(Math.round(h0) + 12))
    await height.press('Enter')
    await expect.poll(async () => (await towers(p))[0].height, { timeout: 15_000 }).not.toBe(h0)
  } else {
    test.info().annotations.push({ type: 'skipped', description: 'No labelled height control in the Form tools: the design change (check 9) was not made.' })
  }
  const model1 = await towers(p)

  // 10 · back to the builder: the applied process is there and nothing is pending (Continue designing, not Apply)
  await openBuilder(p)
  await expect(card(p, 'built.sun')).toBeVisible()
  await expect(chip(p)).toBeVisible()
  await expect(b.getByTestId('builder-continue')).toBeVisible()
  // a rename goes straight to the store (Enter applies it) and survives the reload below
  await b.getByTestId('builder-name').click()
  await b.getByTestId('builder-name-input').fill('Studio process')
  await b.getByTestId('builder-name-input').press('Enter')
  await expect(b.getByTestId('builder-name')).toHaveText(/Studio process/)
  await b.getByTestId('builder-continue').click()
  await expect(builder(p)).toHaveCount(0)
  expect(await towers(p)).toEqual(model1) // opening and closing the builder changed nothing in the model

  // 11 · reload: the process (Sun & shadow, its return path, the name) is the saved one. The design autosaves 0.8 s
  // after its last change (lib/project/session.ts); a reload sooner than that loses the change, builder or no builder.
  await p.waitForTimeout(1500)
  await p.reload()
  await rail(p).waitFor({ timeout: 120_000 })
  await expect(panel(p)).toHaveAttribute('data-phase', 'form', { timeout: 120_000 })
  await expect.poll(() => rows(p), { timeout: 60_000 }).toEqual(['design.massing', 'built.sun'])
  await openBuilder(p)
  await expect(card(p, 'built.sun')).toBeVisible()
  await expect(chip(p)).toBeVisible()
  await expect(b.getByTestId('builder-name')).toHaveText(/Studio process/)
  await expect.poll(() => run(p)).toEqual(['design.site', 'design.massing', 'built.sun', 'design.program', 'design.plates', 'design.frame'])

  // 12 · another edit session, then Discard: the card is taken off (results and model stay, Undo offered), Discard
  // brings the opening workflow back
  await menu(p, 'built.sun', 'card-remove')
  await expect(card(p, 'built.sun')).toHaveCount(0)
  await expect(b.getByTestId('sequence-note')).toContainText('taken off the workflow')
  await expect(b.getByTestId('sequence-note')).toContainText(/Undo/)
  await expect(b.getByTestId('builder-discard')).toBeVisible()
  expect(await towers(p)).toEqual(model1) // removing a card never deletes geometry
  await b.getByTestId('builder-discard').click()
  await expect(builder(p)).toHaveCount(0)
  await expect.poll(() => rows(p)).toEqual(['design.massing', 'built.sun'])
  await openBuilder(p)
  await expect(card(p, 'built.sun')).toBeVisible()
  await expect(chip(p)).toBeVisible()
  await expect(b.getByTestId('builder-continue')).toBeVisible()

  // No keyboard trap in the other direction either: Tab stays inside the dialog and never leaves it for the workspace
  // under it (the full check, from a fresh page, is below); the inspector collapses to a rail and expands again.
  await b.getByTestId('inspector-collapse').click()
  await expect(b.getByTestId('inspector-expand')).toBeVisible()
  await b.getByTestId('inspector-expand').click()
  await expect(b.getByTestId('workflow-inspector')).toBeVisible()
  await p.screenshot({ path: 'test-results/workflow-builder.png' })
})

test('13 · missing-input state: with no tower, Program & FSR says Needs model (never a zero result)', async ({ page: p }) => {
  test.setTimeout(300_000)
  await seed(p, { nodes: DESIGN_STEPS })
  await openProject(p, { tower: false }) // a project opens with no tower (6 Nov)
  await openBuilder(p)
  const b = builder(p)
  await expect(b.getByTestId('card-summary-design.massing')).toContainText('No tower yet')
  const lib = b.getByTestId('tool-library')
  await lib.getByTestId('library-search').fill('fsr')
  await lib.getByTestId('library-add-built.fsr').click()
  await b.getByTestId('pending-add').getByTestId('add-confirm-yes').click()
  await expect(card(p, 'built.fsr')).toBeVisible()
  await expect(b.getByTestId('card-state-built.fsr')).toHaveAttribute('data-state', 'needs-model')
  await expect(b.getByTestId('card-state-built.fsr')).toContainText('Needs model')
  await expect(b.getByTestId('card-summary-built.fsr')).toHaveCount(0) // no result to summarise
  await card(p, 'built.fsr').click()
  await expect(b.getByTestId('inspector-state')).toContainText('Needs model')
  // the state is a state, not an availability: the library still offers the tool as implemented
  await expect(lib.getByTestId('library-entry-built.fsr')).not.toHaveAttribute('data-missing', '')
})

test('14 · a saved workflow referring to a custom tool that is not installed keeps it, as a missing reference', async ({ page: p }) => {
  test.setTimeout(300_000)
  const edges: Edge[] = [{ a: 'start', b: 'design.site' }, { a: 'design.site', b: 'community.ghost' }, { a: 'community.ghost', b: 'enter' }]
  await seed(p, { nodes: ['design.site', 'community.ghost'], edges, name: 'Test' })
  await openProject(p, { tower: false })
  await openBuilder(p)
  const b = builder(p)
  // the card is there, in its place, with a truthful state
  await expect(card(p, 'community.ghost')).toBeVisible()
  await expect(card(p, 'community.ghost')).toHaveAttribute('data-lane', 'main')
  await expect(b.getByTestId('card-state-community.ghost')).toHaveAttribute('data-state', 'missing')
  await expect(b.getByTestId('card-state-community.ghost')).toContainText('Missing tool')
  await expect.poll(() => run(p)).toEqual(['design.site', 'community.ghost'])
  // the library lists it under My tools as a recoverable reference, never deleted
  const lib = b.getByTestId('tool-library')
  await expect(lib.getByTestId('library-mine')).toBeVisible()
  await expect(lib.getByTestId('library-entry-community.ghost')).toHaveAttribute('data-missing', '')
  await expect(lib.getByTestId('library-add-community.ghost')).toHaveText('Show')
  // research-only tools are not normal choices: their section is closed and offers no Add
  await expect(lib.getByTestId('library-research')).not.toHaveAttribute('open', '')
  // Apply, then open again: the reference survives an edit session untouched
  await card(p, 'community.ghost').click()
  await expect(b.getByTestId('inspector-state')).toContainText('Missing tool')
  await b.getByTestId('builder-continue').click()
  await expect(builder(p)).toHaveCount(0)
  await openBuilder(p)
  await expect(card(p, 'community.ghost')).toBeVisible()
  await expect(b.getByTestId('card-state-community.ghost')).toHaveAttribute('data-state', 'missing')
})

test('no keyboard trap: Tab moves through the builder and stays inside it; Esc closes a popover, not the builder', async ({ page: p }) => {
  test.setTimeout(300_000)
  await seed(p, { nodes: DESIGN_STEPS })
  await openProject(p, { tower: false })
  await openBuilder(p)
  const b = builder(p)
  const inside = () => p.evaluate(() => {
    const el = document.activeElement
    return !!el && el !== document.body && !!el.closest('section[data-testid="workflow-builder"]')
  })
  await b.getByTestId('builder-name').focus()
  const seen = new Set<string>()
  for (let i = 0; i < 30; i++) {
    await p.keyboard.press('Tab')
    expect(await inside(), `Tab ${i + 1}: focus left the builder`).toBe(true)
    seen.add(await p.evaluate(() => { const e = document.activeElement as HTMLElement; return e.dataset.testid ?? e.getAttribute('aria-label') ?? e.tagName }))
  }
  expect(seen.size).toBeGreaterThan(3) // focus moves on, it is not stuck on one control
  // a card takes focus and Enter selects it (no commit); Esc in a popover closes the popover only
  await card(p, 'design.massing').focus()
  await p.keyboard.press('Enter')
  await expect(card(p, 'design.massing')).toHaveAttribute('aria-current', 'true')
  await expect(b.getByTestId('builder-continue')).toBeVisible() // selecting changed nothing
  await b.getByTestId('card-menu-design.massing').click()
  await expect(b.getByTestId('card-return')).toBeVisible()
  await p.keyboard.press('Escape')
  await expect(b.getByTestId('card-return')).toHaveCount(0)
  await expect(b).toBeVisible()
  expect(await inside()).toBe(true)
})

test.describe('1280 × 800', () => {
  test.use({ viewport: { width: 1280, height: 800 } })
  test('primary actions are reachable and nothing scrolls sideways', async ({ page: p }) => {
    test.setTimeout(300_000)
    await seed(p, { nodes: DESIGN_STEPS })
    await openProject(p, { tower: false })
    await openBuilder(p)
    const b = builder(p)
    const within = async (l: Locator) => {
      await expect(l).toBeVisible()
      const r = (await l.boundingBox())!
      expect(r.x, 'left edge').toBeGreaterThanOrEqual(0)
      expect(r.y, 'top edge').toBeGreaterThanOrEqual(0)
      expect(r.x + r.width, 'right edge').toBeLessThanOrEqual(1280)
      expect(r.y + r.height, 'bottom edge').toBeLessThanOrEqual(800)
    }
    await within(b.getByTestId('builder-continue'))
    await card(p, 'design.massing').click()
    await within(b.getByTestId('inspector-open'))
    await within(b.getByTestId('inspector-remove'))
    // an edit makes Apply the primary action: it must be in view too
    await b.getByTestId('tool-library').getByTestId('library-add-built.sun').click()
    await b.getByTestId('pending-add').getByTestId('add-confirm-yes').click()
    await within(b.getByTestId('builder-apply'))
    await within(b.getByTestId('builder-discard'))
    // the sequence scrolls within its region; the application never scrolls sideways
    const page = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, bw: document.body.scrollWidth }))
    expect(page.sw).toBeLessThanOrEqual(page.iw)
    expect(page.bw).toBeLessThanOrEqual(page.iw)
    await p.screenshot({ path: 'test-results/workflow-builder-1280.png' })
  })
})
