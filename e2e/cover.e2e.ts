// The cover (7 Nov): the box's role menu previews each role's starting workflow on the string and restores it on
// leaving; a click keeps it; a floating node clicked is threaded; Enter goes into the guided app with that workflow.
import { expect, test } from '@playwright/test'

test('the cover: preview a role, keep one, thread a node, enter with the workflow', async ({ page }) => {
  test.setTimeout(180_000)
  await page.addInitScript(() => { try { localStorage.setItem('ts.onboarding.seen', '1') } catch { /* private mode */ } })
  await page.goto('/')
  const name = page.getByTestId('cover-chain-name')
  await expect(name).toHaveText('Enter the Vancouver Tall Challenge')
  // Hovering a role shows its workflow; leaving the list puts the string back.
  await page.getByTestId('cover-role').click()
  await page.locator('[data-role="engineer"]').hover()
  await expect(name).toHaveText('Structure and wind')
  await page.mouse.move(40, 880)
  await expect(name).toHaveText('Enter the Vancouver Tall Challenge')
  // A click keeps it.
  await page.locator('[data-role="practitioner"]').click()
  await expect(name).toHaveText('Rezoning feasibility')
  const on = page.locator('[data-cover-node][data-on="1"]')
  const before = await on.count()
  // A floating node, clicked, is threaded onto the string.
  await page.locator('[data-cover-node][data-on="0"]').first().focus()
  await page.keyboard.press('Enter')
  await expect(on).toHaveCount(before + 1)
  await expect(name).toHaveText('Rezoning feasibility (edited)')
  // Enter goes in with that workflow.
  await page.getByTestId('cover-enter').click()
  await expect(page).toHaveURL(/#\/guided/, { timeout: 30_000 })
  await expect(page.getByRole('heading', { name: 'Design tools' })).toBeVisible({ timeout: 60_000 })
  await expect(page.getByRole('combobox', { name: 'Role' })).toHaveValue('practitioner')
})
