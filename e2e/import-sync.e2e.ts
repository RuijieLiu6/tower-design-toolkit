// The Import window simplified and Sync model (Ruijie, 17 Nov: "simplify the text further, and develop an icon for each
// of the five options … Bring in a 3D model is really the same as the Import in Massing … put a Live model or Sync model
// option in the Untitled project drop-down"). Driven like a user: project menu › Import… shows five icon tiles with
// short words (the full name on hover); 3D model shows the six platform tiles of the Massing import, and a Rhino
// fixture goes through the same model import to the results; the Export side has the same tiles; project menu › Sync
// model… lists the platforms with Rhino tested and the others unverified, the link state and the chosen platform's
// steps. Screenshots go to docs/evaluation/2026-11-17-import-sync/.
import { expect, test } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { openResultDetails, openTransfer, placeStartingTower } from './helpers'

const SHOTS = join(process.cwd(), 'docs', 'evaluation', '2026-11-17-import-sync')
mkdirSync(SHOTS, { recursive: true })
const FIXTURE = join(process.cwd(), 'tools', 'import-fixtures', 'typical-two-towers-mm.3dm')

test('Import window: five icon tiles, 3D model = the Massing import; Sync model in the project menu', async ({ page: p }) => {
  test.setTimeout(480_000)
  if (!existsSync(FIXTURE)) execFileSync(process.execPath, ['tools/make_import_fixtures.mjs'], { cwd: process.cwd() })
  await p.addInitScript(() => { try { localStorage.setItem('ts.landing.skip', '1'); localStorage.setItem('ts.onboarding.seen', '1') } catch { /* ignore */ } })
  const errors: string[] = []
  p.on('pageerror', (e) => errors.push(e.message))
  await p.goto('/#/guided')
  await p.waitForSelector('#root > *', { timeout: 60_000 })
  await p.getByRole('tab', { name: 'Competition site' }).or(p.getByRole('button', { name: 'Competition site' })).first().click({ timeout: 120_000 })
  await placeStartingTower(p, { stay: true })

  // Import: five tiles, each an icon with one or two words; the full name shows on hover.
  await openTransfer(p, 'import')
  const dialog = p.getByTestId('transfer-dialog')
  await expect(dialog).toHaveAttribute('data-tab', 'import')
  const tiles = dialog.locator('[role="radio"][data-testid^="purpose-"]')
  await expect(tiles).toHaveCount(5)
  await expect(dialog.locator('[data-testid^="purpose-"] .gicon')).toHaveCount(5)
  expect(await tiles.evaluateAll((els) => els.map((e) => (e.textContent ?? '').trim()))).toEqual(['3D model', 'Project', 'Workflow', 'Site boundary', 'My tool'])
  await expect(dialog.getByTestId('purpose-site')).toBeDisabled() // Real Vancouver only
  await dialog.getByTestId('purpose-model').hover()
  await expect(p.getByRole('tooltip')).toContainText('Bring in a 3D model')
  // 3D model: the six platform tiles of the Massing import, each with its own upload note and file types.
  // 17 Nov: the tiles sit in one row under Import / Export, the first icon under the title; the chosen one in colour, the rest grey.
  const title = await dialog.locator('#transfer-title').boundingBox(), row = await dialog.getByTestId('transfer-purposes').boundingBox()
  const first = await dialog.locator('[data-testid="purpose-model"] .gicon').boundingBox()
  expect(row!.y).toBeGreaterThanOrEqual(title!.y + title!.height)
  expect(Math.abs(first!.x - title!.x)).toBeLessThan(3)
  expect(await tiles.evaluateAll((els) => new Set(els.map((e) => Math.round(e.getBoundingClientRect().top))).size)).toBe(1)
  await expect(dialog.locator('[data-testid^="purpose-"] .gicon-grey')).toHaveCount(5)
  await dialog.getByTestId('purpose-model').click()
  await expect(dialog.locator('[data-testid="purpose-model"] .gicon')).toHaveAttribute('data-level', 'on')
  await expect(dialog.locator('[data-testid^="purpose-"] .gicon-grey')).toHaveCount(4)
  await expect(dialog.locator('[data-platform]')).toHaveCount(6)
  await dialog.locator('[data-platform="other"]').click()
  await expect(dialog.getByTestId('platform-how')).toContainText('OBJ')
  await dialog.locator('[data-platform="rhino"]').click()
  await expect(dialog.getByTestId('platform-how')).toContainText('.3dm')
  await expect(dialog.getByTestId('transfer-action')).toBeDisabled()
  await p.waitForTimeout(400)
  await p.screenshot({ path: join(SHOTS, '01-import-window.png') })
  // A Rhino file goes through the same model import as the Massing tool's Import, to the results.
  await dialog.getByTestId('transfer-file').setInputFiles(FIXTURE)
  await dialog.getByTestId('transfer-action').click()
  const model = p.getByRole('dialog', { name: 'Import a model' })
  await expect(model).toBeVisible()
  await expect(model.getByRole('combobox', { name: 'Role for Core' })).toHaveValue('core', { timeout: 120_000 })
  await model.getByRole('button', { name: /Check units, north and datum/ }).click()
  await expect(model.getByText('In plain words')).toBeVisible({ timeout: 120_000 })
  await model.getByRole('button', { name: /^Use this model|^Update / }).click()
  await expect(model).toBeHidden()
  await p.getByRole('tab', { name: 'Results', exact: true }).click()
  await openResultDetails(p)
  await expect(p.getByText('Height band: Tower A').filter({ visible: true }).first()).toBeVisible({ timeout: 60_000 })

  // Export: the same tile treatment.
  await openTransfer(p, 'export')
  await expect(dialog).toHaveAttribute('data-tab', 'export')
  await expect(dialog.locator('[data-testid^="purpose-"] .gicon')).toHaveCount(5)
  expect(await dialog.locator('[role="radio"][data-testid^="purpose-"]').evaluateAll((els) => els.map((e) => (e.textContent ?? '').trim()))).toEqual(['Geometry', 'Backup', 'Workflow', 'Results', 'My tool'])
  await p.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)

  // Sync model: the platforms, honestly flagged; the link's state; the chosen platform's steps.
  await p.getByRole('button', { name: /^Project file/ }).click()
  await p.getByTestId('sync-model').click()
  const sync = p.getByTestId('sync-dialog')
  await expect(sync).toBeVisible()
  await expect(sync.locator('[data-sync-platform]')).toHaveCount(6)
  await expect(sync.locator('[data-sync-platform="rhino"]')).toHaveAttribute('data-tested', 'ok')
  await expect(sync.locator('[data-sync-platform="rhino"]')).toContainText('Tested')
  for (const id of ['revit', 'archicad', 'autocad', 'sketchup']) {
    await expect(sync.locator(`[data-sync-platform="${id}"]`)).toHaveAttribute('data-tested', 'no')
    await expect(sync.locator(`[data-sync-platform="${id}"]`)).toContainText('Unverified')
  }
  await expect(sync.getByTestId('sync-status')).toContainText('Not connected')
  await expect(sync.getByTestId('sync-body')).toContainText('Rhino')
  await expect(sync.getByTestId('rhino-connect')).toBeVisible()
  await sync.locator('[data-sync-platform="sketchup"]').click()
  await expect(sync.getByTestId('sync-body')).toContainText('SketchUp')
  await expect(sync.getByTestId('sync-body')).toContainText('unverified')
  await p.waitForTimeout(400)
  await p.screenshot({ path: join(SHOTS, '02-sync-model.png') })
  await p.keyboard.press('Escape')
  await expect(sync).toHaveCount(0)
  await expect(p.getByRole('button', { name: /^Project file/ })).toBeFocused()
  expect(errors).toEqual([])
})
