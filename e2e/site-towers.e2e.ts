// The towers on the site, in the right panel's Your site tab (Ruijie, 5 Nov: "once you add volume in the map, allow the
// right site panel to indicate that an tower is added, once the user click on the right side button they can name the
// components and delete them"): Add tower in the Form step opens Your site with the new tower marked New; its pencil
// button opens the name and Delete; Undo brings it back.
// Run: node node_modules/playwright/cli.js test e2e/site-towers.e2e.ts
import { expect, test } from '@playwright/test'
import { placeStartingTower } from './helpers'

test('a tower added shows in Your site, marked New, and can be renamed, deleted and brought back', async ({ page }) => {
  test.setTimeout(300_000)
  await page.addInitScript(() => { try { localStorage.setItem('ts.landing.skip', '0'); localStorage.setItem('ts.onboarding.seen', '1') } catch { /* private mode */ } })
  await page.goto('/#/guided')
  await page.waitForSelector('#root > *', { timeout: 60_000 })
  await page.getByRole('tab', { name: 'Competition site' }).or(page.getByRole('button', { name: 'Competition site' })).first().click()
  // A project opens with no tower (6 Nov): place Tower 1 first, as a user does; then Add tower adds a second.
  await placeStartingTower(page, { stay: true })
  await page.getByRole('tab', { name: 'Results', exact: true }).click()

  const rows = page.getByTestId('site-tower')
  await page.getByRole('button', { name: 'Add tower' }).first().click()
  // The right panel opens Your site, with the new tower marked New.
  await expect(page.getByRole('tab', { name: /Your site/ })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('site-towers')).toBeVisible()
  const count = await rows.count()
  expect(count).toBeGreaterThanOrEqual(2)
  const fresh = rows.filter({ hasText: 'New' })
  await expect(fresh).toHaveCount(1)

  // The button on the right opens the name and Delete (and the tower no longer reads New: it has been seen).
  const was = (await fresh.locator('b').first().textContent())!.trim()
  const row = rows.filter({ hasText: was })
  await row.getByRole('button', { name: /^Rename or delete/ }).click()
  await expect(row).not.toContainText('New')
  await row.getByRole('textbox').fill('Tower Sinnie')
  await row.getByRole('button', { name: 'Save' }).click()
  const renamed = rows.filter({ hasText: 'Tower Sinnie' })
  await expect(renamed).toHaveCount(1)
  await expect(renamed).not.toContainText('New')

  await renamed.getByRole('button', { name: /^Rename or delete/ }).click()
  await renamed.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(rows).toHaveCount(count - 1)
  await expect(page.getByTestId('site-towers')).toContainText('Deleted Tower Sinnie')
  await page.getByTestId('site-towers').getByRole('button', { name: 'Undo' }).click()
  await expect(rows).toHaveCount(count)
  await expect(rows.filter({ hasText: 'Tower Sinnie' })).toHaveCount(1)
})
