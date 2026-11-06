// After an upload: place the model on the site, give it its basement, confirm (Ruijie, 6 Nov: "once you click link rhino,
// instruct the user to posit the building on the specific location and confirm site"; "define the basement level with
// the users"). On the competition site, with a synthetic .3dm (tools/make_import_fixtures.mjs, never the competition model).
// Run: node node_modules/playwright/cli.js test e2e/place-model.e2e.ts
import { expect, test } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { openDesignTool } from './helpers'

const FIXTURE = join(process.cwd(), 'tools', 'import-fixtures', 'typical-two-towers-mm.3dm')

test('after an upload: place it on the site, set its basement, confirm', async ({ page }) => {
  test.setTimeout(300_000)
  if (!existsSync(FIXTURE)) execFileSync(process.execPath, ['tools/make_import_fixtures.mjs'], { cwd: process.cwd() })
  await page.addInitScript(() => { try { localStorage.setItem('ts.landing.skip', '0'); localStorage.setItem('ts.onboarding.seen', '1') } catch { /* private mode */ } })
  await page.goto('/#/guided')
  await page.waitForSelector('#root > *', { timeout: 60_000 })
  await page.getByRole('button', { name: 'Start designing' }).click({ timeout: 3000 }).catch(() => {})
  await page.getByRole('tab', { name: 'Competition site' }).or(page.getByRole('button', { name: 'Competition site' })).first().click()
  await page.getByRole('navigation', { name: 'Design process' }).getByRole('button', { name: 'Site' }).click()
  await openDesignTool(page, 'rhino-import')
  await page.locator('[data-tool="tool.rhino-import"]').click()
  const dialog = page.getByRole('dialog', { name: 'Upload a model' })
  await dialog.locator('input[type="file"]').setInputFiles(FIXTURE)
  await dialog.getByRole('button', { name: /Check units, north and datum/ }).click({ timeout: 120_000 })
  await expect(dialog).toContainText('Next, you place it on the site, set its basement and confirm.', { timeout: 120_000 })
  await dialog.getByRole('button', { name: /^Use this model/ }).click()
  await expect(dialog).toBeHidden()

  // The guide opens in the Import tool, on the competition block, with placing on (the toolbar says how).
  const guide = page.getByTestId('place-guide')
  await expect(guide).toContainText('Place your model on the site')
  await expect(guide).toContainText('Site: the competition block')
  await expect(page.getByTestId('toolbar-placing')).toBeVisible()
  await page.getByTestId('place-centre').click()
  await expect(page.getByTestId('place-fit')).toBeVisible()

  // The basement: three levels, dug to the whole site.
  await page.getByTestId('place-next').click()
  await page.getByTestId('place-levels-3').click()
  await page.getByTestId('place-dig-site').click()
  await expect(page.getByTestId('place-basement')).toContainText('9.6 m deep')
  await expect(page.getByTestId('place-basement')).toContainText('11,468 m² a level')

  await page.getByTestId('place-confirm').click()
  await expect(guide).toBeHidden()
  await expect(page.getByTestId('place-status')).toContainText('Placed on the competition block')
  await expect(page.getByTestId('toolbar-placing')).toBeHidden()
  // It can be opened again.
  await page.getByTestId('place-again').click()
  await expect(guide).toBeVisible()
})
