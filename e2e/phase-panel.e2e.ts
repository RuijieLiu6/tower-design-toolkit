// The five-phase workspace (Ruijie, 8 Nov), the Form example: "Massing, Sun & shadow and Wind screen, including a return
// path to Massing. Test design editing, rearrangement, phase switching, state preservation and phase-package
// export/import." The phase row picks Form; the left panel shows Form's own workflow, then the open tool's controls; the
// whole workflow runs along the bottom and can be expanded and rearranged there, with the left panel following.
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
const openImport = async (p: Page) => { if ((await p.getByTestId('phase-import').getAttribute('aria-expanded')) !== 'true') await p.getByTestId('phase-import').click() }
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
  await p.getByTestId('phase-edit').click()
  await row(p, 'built.wind-screen').click()
  await p.getByTestId('phase-node-actions').getByRole('button', { name: /Connect \/ loop/ }).click()
  await expect(p.getByTestId('phase-connect-list').locator('[data-connect="design.massing"]')).toContainText('return path')
  await p.getByTestId('phase-connect-list').locator('[data-connect="design.massing"]').click()
  await expect(panel(p).locator(`[data-loop="${LOOP}"]`)).toHaveCount(1)
  await expect(panel(p).locator(`[data-return="${LOOP}"]`)).toContainText('Return to Massing')
  await expect(p.getByTestId('phase-note')).toContainText('Return path created')

  // 2 · rearrangement, three ways: Move up, the handle's arrow keys, and dragging the handle; Undo and Redo
  await row(p, 'built.wind-screen').click() // pick it again (the connect list closed)
  if (!(await p.getByTestId('phase-node-actions').isVisible())) await row(p, 'built.wind-screen').click()
  await p.getByTestId('phase-node-actions').getByRole('button', { name: 'Move up' }).click()
  await expect.poll(() => rows(p)).toEqual(['design.massing', 'built.wind-screen', 'built.sun'])
  await expect(panel(p).locator(`[data-loop="${LOOP}"]`)).toHaveCount(1) // the return path survives the move
  await panel(p).locator('[data-grip="built.wind-screen"]').focus()
  await p.keyboard.press('ArrowDown')
  await expect.poll(() => rows(p)).toEqual(FORM)
  const grip = await panel(p).locator('[data-grip="built.wind-screen"]').boundingBox()
  const sun = await panel(p).locator('[data-phase-node="built.sun"]').boundingBox()
  await p.mouse.move(grip!.x + grip!.width / 2, grip!.y + grip!.height / 2)
  await p.mouse.down()
  for (let k = 1; k <= 6; k++) await p.mouse.move(grip!.x + grip!.width / 2, grip!.y + (sun!.y + 4 - grip!.y) * (k / 6))
  await p.mouse.up()
  await expect.poll(() => rows(p)).toEqual(['design.massing', 'built.wind-screen', 'built.sun'])
  await p.getByTestId('phase-undo').click()
  await expect.poll(() => rows(p)).toEqual(FORM)
  await expect(panel(p).locator(`[data-loop="${LOOP}"]`)).toHaveCount(1)
  await p.getByTestId('phase-done').click()

  // 3 · a tool opens its controls here and its results on the right; nothing else changes
  await row(p, 'built.sun').click()
  await expect(panel(p).getByTestId('phase-active')).toHaveAttribute('data-active', 'built.sun')
  await expect(panel(p).getByTestId('phase-active').getByText('Month')).toBeVisible()
  await expect(p.getByLabel('Show results for')).toHaveValue('built.sun')

  // 4 · the whole workflow along the bottom: Expand, then drag to reorder and drag or click to add (each add confirmed);
  // Form's panel on the left follows at once
  const dock = p.getByTestId('workflow-dock')
  await expect(dock.getByTestId('dock-row').locator('[data-dock-id="built.wind-screen"]')).toBeVisible()
  await dock.getByTestId('dock-overview').click()
  const overview = dock.getByTestId('dock-expanded')
  await expect(overview.locator(`[data-dock-edge="${LOOP}"]`)).toHaveCount(1)
  const canvas = overview.getByTestId('dock-canvas')
  const center = async (l: ReturnType<Page['locator']>) => { const b = (await l.boundingBox())!; return { x: b.x + b.width / 2, y: b.y + b.height / 2 } }
  const gapBetween = async (a: string, b: string) => {
    const A = await center(canvas.locator(`[data-dock-node="${a}"]`)), B = await center(canvas.locator(`[data-dock-node="${b}"]`))
    return { x: (A.x + B.x) / 2, y: A.y }
  }
  const dragTo = async (from: { x: number; y: number }, to: { x: number; y: number }) => {
    await p.mouse.move(from.x, from.y); await p.mouse.down()
    for (let k = 1; k <= 10; k++) await p.mouse.move(from.x + ((to.x - from.x) * k) / 10, from.y + ((to.y - from.y) * k) / 10)
    await p.mouse.up()
  }
  const undo = () => overview.getByRole('button', { name: 'Undo the last workflow change' }).click()
  // a tool dragged to a gap moves there, without entering Edit; Undo takes it back
  await dragTo(await center(canvas.locator('[data-dock-node="built.wind-screen"]')), await gapBetween('design.massing', 'built.sun'))
  await expect.poll(() => rows(p)).toEqual(['design.massing', 'built.wind-screen', 'built.sun'])
  await undo()
  await expect.poll(() => rows(p)).toEqual(FORM)
  // a click on a tool in the tray asks first; Cancel leaves the workflow as it was
  const tray = overview.getByTestId('dock-tray')
  await tray.locator('[data-tray="built.solar-access"]').click()
  await expect(overview.getByTestId('add-confirm')).toContainText('Solar access')
  await overview.getByTestId('add-confirm-no').click()
  await expect(overview.getByTestId('add-confirm')).toHaveCount(0)
  expect(await rows(p)).toEqual(FORM)
  // dragged into the gap after Sun & shadow: the confirmation names that place; Add puts it there and in the Form panel
  await dragTo(await center(tray.locator('[data-tray="built.solar-access"]')), await gapBetween('built.sun', 'built.wind-screen'))
  await expect(overview.getByTestId('add-after')).toHaveValue('built.sun')
  await overview.getByTestId('add-confirm-yes').click()
  await expect.poll(() => rows(p)).toEqual(['design.massing', 'built.sun', 'built.solar-access', 'built.wind-screen'])
  await expect(dock.getByTestId('dock-tray').locator('[data-tray="built.solar-access"]')).toHaveCount(0)
  await undo()
  await expect.poll(() => rows(p)).toEqual(FORM)
  // Edit adds Move before / after (and connections, Remove, the assistant)
  await dock.getByTestId('dock-edit').click()
  await overview.locator('[data-dock-node="built.wind-screen"]').click()
  await overview.getByTestId('dock-node-actions').getByRole('button', { name: 'Move before' }).click()
  await expect.poll(() => rows(p)).toEqual(['design.massing', 'built.wind-screen', 'built.sun'])
  await overview.getByRole('button', { name: 'Undo the last workflow change' }).click()
  await expect.poll(() => rows(p)).toEqual(FORM)
  await dock.getByTestId('dock-done').click()
  await dock.getByTestId('dock-collapse').click()
  await expect(overview).toHaveCount(0)

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
  await expect(panel(p).locator(`[data-loop="${LOOP}"]`)).toHaveCount(1)

  // 6 · export the Form package
  await p.getByTestId('phase-export').click()
  const [dl] = await Promise.all([p.waitForEvent('download'), p.getByTestId('export-phase-package').click()])
  const pkg = JSON.parse(readFileSync((await dl.path())!, 'utf8'))
  expect(pkg.format).toBe('tower-studio-phase@1')
  expect(pkg.phase).toBe('form')
  expect(pkg.workflow.nodes).toEqual(FORM)
  expect(pkg.workflow.edges.map((e: { a: string; b: string }) => `${e.a}>${e.b}`)).toContain(LOOP)
  expect(Object.keys(pkg.settings)).toEqual(expect.arrayContaining(['towers', 'sun']))
  expect(pkg.settings.towers).toHaveLength(1)
  expect(pkg.results.modelRevision).toMatch(/^[0-9a-f]{8}$/)
  await expect(p.getByTestId('export-status')).toContainText('3 tools')
  const file = (await dl.path())!

  // 7 · import by Merge: Wind screen taken off, then brought back with its return path, after a preview
  await p.getByTestId('phase-edit').click()
  await row(p, 'built.wind-screen').click()
  await p.getByTestId('phase-remove').click()
  await expect.poll(() => rows(p)).toEqual(['design.massing', 'built.sun'])
  await p.getByTestId('phase-done').click()
  await openImport(p)
  await p.getByTestId('phase-package-file').setInputFiles(file)
  const preview = p.getByTestId('phase-package-preview')
  await expect(preview).toBeVisible()
  await expect(preview.locator('[data-pp-node="built.wind-screen"]')).toHaveAttribute('data-state', 'new')
  await expect(preview.locator('[data-pp-node="built.sun"]')).toHaveAttribute('data-state', 'already here')
  await expect(preview.getByTestId('pp-settings')).not.toBeChecked() // Merge keeps your settings unless ticked
  await preview.getByTestId('pp-apply').click()
  await expect(preview).toHaveCount(0)
  await expect.poll(() => rows(p)).toEqual(FORM)
  await expect(panel(p).locator(`[data-loop="${LOOP}"]`)).toHaveCount(1)

  // 8 · import by Replace: an extra Form tool is taken off; the model stays one tower
  await p.getByTestId('phase-add').click()
  await p.getByTestId('phase-add-list').locator('[data-add="built.solar-access"]').click()
  await p.getByTestId('phase-add-list').getByTestId('add-confirm-yes').click()
  await expect.poll(() => rows(p)).toContain('built.solar-access')
  await openImport(p)
  await p.getByTestId('phase-package-file').setInputFiles(file)
  await preview.locator('input[data-mode="replace"]').check()
  await expect(preview.locator('[data-pp-node="built.solar-access"]')).toHaveAttribute('data-state', 'taken off')
  await expect(preview.getByTestId('pp-model')).toBeChecked()
  await preview.getByTestId('pp-apply').click()
  await expect.poll(() => rows(p)).toEqual(FORM)
  await expect(panel(p).locator(`[data-loop="${LOOP}"]`)).toHaveCount(1)
  await expect(await towerCount(p)).toContainText('(1)')
  await p.screenshot({ path: 'test-results/phase-panel.png' })
})
