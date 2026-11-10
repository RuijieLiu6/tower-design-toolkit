// The five-phase workspace (Ruijie, 8 Nov), the Form example: "Massing, Sun & shadow and Wind screen, including a return
// path to Massing. Test design editing, rearrangement, phase switching, state preservation and phase-package
// export/import." The phase row picks Form; the left panel shows Form's tools and a map of the whole workflow, then the
// open tool's controls; its Workflow header opens the editor in the centre view (9 Nov), where tools are added from the
// shelf (the best place lights up), connected from their connection points, moved, and confirmed or discarded.
// The model (a placed tower) and the open tool stay through every edit, phase switch and reload; a phase package saves
// Form and brings it back by Merge and by Replace, after a preview.
import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { placeStartingTower } from './helpers'

const rail = (p: Page) => p.getByRole('navigation', { name: 'Design process' })
const panel = (p: Page) => p.getByTestId('phase-panel')
const rows = (p: Page) => panel(p).locator('[data-phase-node]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.phaseNode))
const row = (p: Page, id: string) => panel(p).locator(`[data-phase-node="${id}"] [data-node]`)
const towerCount = async (p: Page) => {
  await p.getByRole('tab', { name: 'Your site' }).click().catch(() => {})
  return p.getByText(/Towers on this site/).first()
}
// Import and Export are the project bar's transfer centre (9 Nov): purpose first, the file, then the named action.
const openImport = async (p: Page) => { await p.getByTestId('transfer-import').click(); await p.getByTestId('purpose-package').click() }
const importFile = async (p: Page, file: string) => { await openImport(p); await p.getByTestId('transfer-file').setInputFiles(file); await p.getByTestId('transfer-action').click() }
const FORM = ['design.massing', 'built.sun', 'built.wind-screen']
const LOOP = 'built.wind-screen>design.massing'

test('Form: Massing → Sun & shadow → Wind screen ↻ Massing; edit, rearrange, switch phases, keep state, export and import', async ({ page: p }) => {
  test.setTimeout(420_000)
  await p.addInitScript(() => { try { localStorage.setItem('ts.landing.skip', '0'); localStorage.setItem('ts.onboarding.seen', '1') } catch { /* ignore */ } })
  await p.goto('/#/guided')
  await rail(p).waitFor({ timeout: 120_000 })
  await p.getByRole('tab', { name: 'Competition site' }).click({ timeout: 120_000 })
  await placeStartingTower(p, { stay: true })
  await expect(rail(p).locator('[aria-current="step"]')).toHaveAttribute('data-phase', 'form')
  await expect(panel(p)).toHaveAttribute('data-phase', 'form')
  await expect(panel(p).getByRole('heading', { name: 'Form', exact: true })).toBeVisible()
  await expect(await towerCount(p)).toContainText('(1)')
  // a fresh project: Form's own design tool leads the list
  expect((await rows(p))[0]).toBe('design.massing')

  // 1 · design editing: Sun & shadow and Wind screen after Massing, a return path from Wind screen to Massing
  for (const id of ['built.sun', 'built.wind-screen']) {
    await p.getByTestId('phase-add').click()
    await p.getByTestId('phase-add-list').locator(`[data-add="${id}"]`).click()
    await p.getByTestId('phase-add-list').getByTestId('add-confirm-yes').click() // adding asks first (8 Nov)
    await expect(panel(p).getByTestId('phase-active')).toHaveAttribute('data-active', id) // a new tool opens
  }
  expect(await rows(p)).toEqual(FORM)

  // The workflow editor, in the centre view (9 Nov): the panel's Workflow header opens it; the panel stays beside it.
  const dock = p.getByTestId('workflow-overview')
  const overview = dock.getByTestId('dock-expanded')
  const canvas = overview.getByTestId('dock-canvas')
  const center = async (l: ReturnType<Page['locator']>) => { const b = (await l.boundingBox())!; return { x: b.x + b.width / 2, y: b.y + b.height / 2 } }
  const gapBetween = async (a: string, b: string) => {
    const A = await center(canvas.locator(`[data-dock-node="${a}"]`)), B = await center(canvas.locator(`[data-dock-node="${b}"]`))
    return { x: (A.x + B.x) / 2, y: A.y }
  }
  const dragTo = async (from: { x: number; y: number }, to: { x: number; y: number }, hold?: () => Promise<void>) => {
    await p.mouse.move(from.x, from.y); await p.mouse.down()
    for (let k = 1; k <= 10; k++) await p.mouse.move(from.x + ((to.x - from.x) * k) / 10, from.y + ((to.y - from.y) * k) / 10)
    if (hold) await hold()
    await p.mouse.up()
  }
  const undo = () => overview.getByRole('button', { name: 'Undo the last workflow change' }).click()
  await expect(dock).toHaveCount(0)
  await p.getByTestId('phase-edit').click()
  await expect(dock).toBeVisible()
  await expect(panel(p)).toBeVisible() // the editor takes the centre view only
  const main = (await p.locator('main').boundingBox())!, ed = (await dock.boundingBox())!
  expect(Math.abs(ed.x - main.x)).toBeLessThan(2); expect(Math.abs(ed.width - main.width)).toBeLessThan(2)
  await expect(dock.locator('[data-lane]')).toHaveCount(5)
  await expect(dock.locator('[data-here]')).toContainText('Form')

  // 1b · a return path, drawn as on the landing page: hover Wind screen, drag from a connection point to Massing
  const wind = canvas.locator('[data-dock-node="built.wind-screen"]')
  await wind.hover()
  const handle = canvas.locator('span.group:has([data-dock-node="built.wind-screen"]) [data-handle="w"]')
  await expect(handle).toBeVisible()
  await dragTo(await center(handle), await center(canvas.locator('[data-dock-node="design.massing"]')), async () => {
    await expect(canvas.getByRole('status').filter({ hasText: 'Create loop' })).toBeVisible()
  })
  await expect(canvas.locator(`[data-dock-edge="${LOOP}"]`)).toHaveCount(1)
  await expect(overview.getByTestId('dock-note')).toContainText('Loop created')
  // the panel follows at once: a ↻ on Wind screen and an arc on the map of the whole workflow
  await expect(panel(p).locator(`[data-return="${LOOP}"]`)).toHaveCount(1)
  await expect(panel(p).locator(`[data-map-loop="${LOOP}"]`)).toHaveCount(1)

  // 2 · rearrangement: Move before, a drag to a gap, Undo; the return path survives
  await wind.click()
  await overview.getByTestId('dock-node-actions').getByRole('button', { name: 'Move before' }).click()
  await expect.poll(() => rows(p)).toEqual(['design.massing', 'built.wind-screen', 'built.sun'])
  await expect(canvas.locator(`[data-dock-edge="${LOOP}"]`)).toHaveCount(1)
  await undo()
  await expect.poll(() => rows(p)).toEqual(FORM)
  await dragTo(await center(wind), await gapBetween('design.massing', 'built.sun'))
  await expect.poll(() => rows(p)).toEqual(['design.massing', 'built.wind-screen', 'built.sun'])
  await undo()
  await expect.poll(() => rows(p)).toEqual(FORM)
  // Confirm workflow keeps the loop and returns to the design; then the editor opens again with it
  await expect(overview.getByTestId('overview-close')).toHaveText(/Confirm workflow/)
  await overview.getByTestId('overview-close').click()
  await expect(dock).toHaveCount(0)
  await expect(panel(p).locator(`[data-return="${LOOP}"]`)).toHaveCount(1)
  await p.getByTestId('phase-edit').click()
  await expect(canvas.locator(`[data-dock-edge="${LOOP}"]`)).toHaveCount(1)

  // 4 · adding from the shelf: a drag lights up the best place (after the last Form tool) and a drop puts it where it is
  // dropped; a click puts it in the best place; Discard changes puts back the workflow the editor opened with
  const tray = overview.getByTestId('dock-tray')
  await tray.locator('[data-tray-phase="form"]').click()
  await dragTo(await center(tray.locator('[data-tray="built.solar-access"]')), await gapBetween('built.sun', 'built.wind-screen'), async () => {
    await expect(canvas.locator('[data-ideal-slot]')).toBeVisible()
    await expect(canvas.locator('[data-ideal-slot]')).toContainText('Best place')
    await expect(canvas.locator('[data-ideal-slot]')).toHaveAttribute('data-ideal-slot', /^form:/)
  })
  await expect.poll(() => rows(p)).toEqual(['design.massing', 'built.sun', 'built.solar-access', 'built.wind-screen'])
  await expect(tray.locator('[data-tray="built.solar-access"]')).toHaveCount(0)
  await undo()
  await expect.poll(() => rows(p)).toEqual(FORM)
  await tray.locator('[data-tray="built.solar-access"]').click()
  await expect.poll(() => rows(p)).toEqual([...FORM, 'built.solar-access']) // the best place: after Wind screen
  await expect(overview.getByTestId('overview-close')).toHaveText(/Confirm workflow/)
  await overview.getByTestId('overview-discard').click()
  await expect(dock).toHaveCount(0)
  await expect.poll(() => rows(p)).toEqual(FORM)
  await expect(panel(p).locator(`[data-return="${LOOP}"]`)).toHaveCount(1) // confirmed before this editor session opened

  // 3 · a tool opens its controls here and its results on the right; nothing else changes
  await row(p, 'built.sun').click()
  await expect(panel(p).getByTestId('phase-active')).toHaveAttribute('data-active', 'built.sun')
  await expect(panel(p).getByTestId('phase-active').getByText('Month')).toBeVisible()
  await expect(p.getByLabel('Show results for')).toHaveValue('built.sun')

  // The panel's Edit opens the same editor; selecting a tool doesn't open it; Return to design puts the working state
  // back (Sun & shadow open in Form); Open in workspace goes to the chosen tool
  await p.getByTestId('phase-edit').click()
  await overview.locator('[data-dock-node="design.massing"]').click()
  await expect(overview.getByTestId('overview-open')).toBeVisible()
  await expect(overview.getByTestId('overview-close')).toHaveText(/Return to design/) // nothing changed
  await overview.getByTestId('overview-close').click()
  await expect(dock).toHaveCount(0)
  await expect(panel(p).getByTestId('phase-active')).toHaveAttribute('data-active', 'built.sun')
  await expect(p.getByLabel('Show results for')).toHaveValue('built.sun')
  await p.getByTestId('phase-edit').click()
  await dock.locator('[data-dock-node="built.wind-screen"]').click()
  await dock.getByTestId('overview-open').click()
  await expect(dock).toHaveCount(0)
  await expect(panel(p).getByTestId('phase-active')).toHaveAttribute('data-active', 'built.wind-screen')
  await row(p, 'built.sun').click()

  // 5 · phase switching and state preservation: Program and back to Form; then a reload
  await rail(p).locator('[data-phase="program"]').click()
  await expect(panel(p)).toHaveAttribute('data-phase', 'program')
  await expect(panel(p).locator(`[data-phase-node="design.program"]`)).toBeVisible()
  await rail(p).locator('[data-phase="form"]').click()
  expect(await rows(p)).toEqual(FORM)
  await expect(panel(p).getByTestId('phase-active')).toHaveAttribute('data-active', 'built.sun') // the open tool is kept
  await expect(await towerCount(p)).toContainText('(1)')
  await p.reload()
  await expect(panel(p)).toHaveAttribute('data-phase', 'form', { timeout: 120_000 })
  await expect.poll(() => rows(p), { timeout: 60_000 }).toEqual(FORM)
  await expect(panel(p).locator(`[data-return="${LOOP}"]`)).toHaveCount(1)

  // 6 · export the Form package
  await p.getByTestId('transfer-export').click()
  await p.getByTestId('purpose-workflow').click()
  const [dl] = await Promise.all([p.waitForEvent('download'), p.getByTestId('transfer-action').click()])
  const pkg = JSON.parse(readFileSync((await dl.path())!, 'utf8'))
  expect(pkg.format).toBe('tower-studio-phase@1')
  expect(pkg.phase).toBe('form')
  expect(pkg.workflow.nodes).toEqual(FORM)
  expect(pkg.workflow.edges.map((e: { a: string; b: string }) => `${e.a}>${e.b}`)).toContain(LOOP)
  expect(Object.keys(pkg.settings)).toEqual(expect.arrayContaining(['towers', 'sun']))
  expect(pkg.settings.towers).toHaveLength(1)
  expect(pkg.results.modelRevision).toMatch(/^[0-9a-f]{8}$/)
  await expect(p.getByTestId('transfer-status')).toContainText('3 tools')
  await p.keyboard.press('Escape')
  const file = (await dl.path())!

  // 7 · import by Merge: Wind screen taken off, then brought back with its return path, after a preview
  await p.getByTestId('phase-edit').click()
  await canvas.locator('[data-dock-node="built.wind-screen"]').click()
  await overview.getByTestId('dock-remove').click()
  await expect.poll(() => rows(p)).toEqual(['design.massing', 'built.sun'])
  await overview.getByTestId('overview-close').click() // Confirm workflow
  await expect(dock).toHaveCount(0)
  await importFile(p, file)
  const preview = p.getByTestId('phase-package-preview')
  await expect(preview).toBeVisible()
  await expect(preview.locator('[data-pp-node="built.wind-screen"]')).toHaveAttribute('data-state', 'new')
  await expect(preview.locator('[data-pp-node="built.sun"]')).toHaveAttribute('data-state', 'already here')
  await expect(preview.getByTestId('pp-settings')).not.toBeChecked() // Merge keeps your settings unless ticked
  await preview.getByTestId('pp-apply').click()
  await expect(preview).toHaveCount(0)
  await expect.poll(() => rows(p)).toEqual(FORM)
  await expect(panel(p).locator(`[data-return="${LOOP}"]`)).toHaveCount(1)

  // 8 · import by Replace: an extra Form tool is taken off; the model stays one tower
  await p.getByTestId('phase-add').click()
  await p.getByTestId('phase-add-list').locator('[data-add="built.solar-access"]').click()
  await p.getByTestId('phase-add-list').getByTestId('add-confirm-yes').click()
  await expect.poll(() => rows(p)).toContain('built.solar-access')
  await importFile(p, file)
  await preview.locator('input[data-mode="replace"]').check()
  await expect(preview.locator('[data-pp-node="built.solar-access"]')).toHaveAttribute('data-state', 'taken off')
  await expect(preview.getByTestId('pp-model')).toBeChecked()
  await preview.getByTestId('pp-apply').click()
  await expect.poll(() => rows(p)).toEqual(FORM)
  await expect(panel(p).locator(`[data-return="${LOOP}"]`)).toHaveCount(1)
  await expect(await towerCount(p)).toContainText('(1)')
  await p.screenshot({ path: 'test-results/phase-panel.png' })
})
