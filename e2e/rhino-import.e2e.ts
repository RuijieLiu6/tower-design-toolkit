// "Rhino import" design tool, end to end: the tool's button in the left panel opens the upload flow, a synthetic .3dm
// (tools/make_import_fixtures.mjs, never the competition model) is mapped, checked and used, and the uploaded towers
// show in the results. Run: node node_modules/playwright/cli.js test e2e/rhino-import.e2e.ts
import { expect, test } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { openDesignTool, openResultDetails } from './helpers'

const FIXTURE = join(process.cwd(), 'tools', 'import-fixtures', 'typical-two-towers-mm.3dm')

test('Rhino import tool: upload a .3dm through the tool button and see its towers in the results', async ({ page }) => {
  test.setTimeout(300_000)
  if (!existsSync(FIXTURE)) execFileSync(process.execPath, ['tools/make_import_fixtures.mjs'], { cwd: process.cwd() })
  await page.addInitScript(() => { try { localStorage.setItem('ts.landing.skip', '0'); localStorage.setItem('ts.onboarding.seen', '1') } catch { /* private mode */ } })
  await page.goto('/#/guided')
  await page.waitForSelector('#root > *', { timeout: 60_000 })
  await page.getByRole('button', { name: 'Start designing' }).click({ timeout: 3000 }).catch(() => {})
  await page.getByRole('tab', { name: 'Competition site' }).or(page.getByRole('button', { name: 'Competition site' })).first().click()
  // A Rhino model brings the lot line, the context and the towers, so the tool is in the Site step (only there, 6 Nov).
  const rail = page.getByRole('navigation', { name: 'Design process' })
  await rail.getByRole('button', { name: 'Site' }).click()
  await expect(rail.getByRole('button', { name: 'Site' })).toHaveAttribute('aria-current', 'step')
  // Its icon reads "Import"; the full name and what it does show on hover (6 Nov).
  const tile = page.locator('[role="tab"][data-tool="rhino-import"]')
  await expect(tile).toContainText('Import')
  await tile.hover()
  await expect(page.getByRole('tooltip')).toContainText('Import a model')
  await openDesignTool(page, 'rhino-import')

  // One click on the tool opens the upload flow.
  const tool = page.locator('[data-tool="tool.rhino-import"]')
  await tool.waitFor({ timeout: 60_000 })
  await expect(tool).toHaveText(/Upload a Rhino model|Upload a new version/)
  await tool.click()
  const dialog = page.getByRole('dialog', { name: 'Import a model' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('Read in this browser; nothing is uploaded to a server.')
  await dialog.locator('input[type="file"]').setInputFiles(FIXTURE)

  // Step 1: the layers are mapped to roles (guessed, checked here), with a live preview.
  await expect(dialog.getByRole('combobox', { name: 'Role for Core' })).toHaveValue('core', { timeout: 120_000 })
  await expect(dialog.getByRole('combobox', { name: 'Role for Site::Lot line' })).toHaveValue('site')
  await dialog.getByRole('button', { name: /Check units, north and datum/ }).click()

  // Step 2: plain-language checks, then use the model.
  await expect(dialog.getByText('In plain words')).toBeVisible({ timeout: 120_000 })
  await expect(dialog).toContainText('2 towers, found by plan overlap')
  await dialog.getByRole('button', { name: /^Use this model|^Update / }).click()
  await expect(dialog).toBeHidden()

  // The towers are in the results (the competition rules check each tower's height).
  // In the Site step the right panel opens on Your site (5 Nov); the towers' results are under Results & evidence.
  await page.getByRole('tab', { name: 'Results & evidence' }).click()
  await openResultDetails(page) // the rule cards sit under Details below the pass/fail checklist (6 Nov)
  // The checklist's passing rows are folded too; the card under Details is the one that shows.
  await expect(page.getByText('Height band: Tower A').filter({ visible: true }).first()).toBeVisible({ timeout: 60_000 })
  await expect(page.getByText('Height band: Tower B').filter({ visible: true }).first()).toBeVisible()
  // The tool now shows what came in. Past Site it leaves the panel (Ruijie, 6 Nov), and the imported towers are there.
  await expect(tool).toHaveText(/Upload a new version/)
  await expect(page.getByText('typical-two-towers-mm.3dm').first()).toBeVisible()
  await rail.getByRole('button', { name: 'Form' }).click()
  await expect(rail.getByRole('button', { name: 'Form' })).toHaveAttribute('aria-current', 'step')
  await expect(tile).toHaveCount(0)
  await expect(page.locator('[role="tab"][data-tool="towers"]')).toBeVisible()
})

test('the uploaded lot line and context buildings are drawn in the 3D view', async ({ page }) => {
  test.setTimeout(300_000)
  if (!existsSync(FIXTURE)) execFileSync(process.execPath, ['tools/make_import_fixtures.mjs'], { cwd: process.cwd() })
  await page.addInitScript(() => { performance.setResourceTimingBufferSize(10_000); try { localStorage.setItem('ts.landing.skip', '0'); localStorage.setItem('ts.onboarding.seen', '1') } catch { /* private mode */ } })
  await page.goto('/#/guided')
  await page.waitForSelector('#root > *', { timeout: 60_000 })
  await page.getByRole('button', { name: 'Start designing' }).click({ timeout: 3000 }).catch(() => {})
  await page.getByRole('tab', { name: 'Competition site' }).or(page.getByRole('button', { name: 'Competition site' })).first().click()
  // Through the Project menu this time (the same dialog).
  await page.getByRole('button', { name: /^Project file/ }).click()
  await page.getByRole('menuitem', { name: /Upload a Rhino model/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Import a model' })
  await dialog.locator('input[type="file"]').setInputFiles(FIXTURE)
  await dialog.getByRole('button', { name: /Check units, north and datum/ }).click({ timeout: 120_000 })
  await expect(dialog.getByText('In plain words')).toBeVisible({ timeout: 120_000 })
  await dialog.getByRole('button', { name: /^Use this model|^Update / }).click()
  await expect(dialog).toBeHidden()
  // The model the overlay draws: one lot line and three context prisms, read from the app's own store instance.
  const roles = await page.evaluate(async () => {
    const url = performance.getEntriesByType('resource').map((e) => e.name).filter((n) => /\/src\/store\.ts/.test(n)).pop()!
    const { useStore } = await import(/* @vite-ignore */ url)
    const m = useStore.getState().models.vtc
    return m ? { site: m.elements.filter((e: { role: string }) => e.role === 'site').length, context: m.elements.filter((e: { role: string }) => e.role === 'context').length } : null
  })
  expect(roles).toEqual({ site: 1, context: 3 })
  await page.keyboard.press('h')
  await page.waitForTimeout(1500)
  await page.screenshot({ path: join(process.cwd(), 'test-results', 'rhino-overlay-vtc.png') })
})
