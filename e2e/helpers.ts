// Shared steps for the browser tests. A project opens with no tower (Ruijie, 6 Nov), so tests that read a tower place
// the starting tower first, the way a user does: Volume step › "Place a tower", Esc to keep it where it lands.
import type { Page } from '@playwright/test'

/**
 * Places the open project's starting tower (if it has none). Goes back to the step the test was on, unless `stay`
 * (then the Volume step stays open, where the tower tools are).
 */
export async function placeStartingTower(p: Page, { stay = false } = {}) {
  const rail = p.getByRole('navigation', { name: 'Design process' })
  const step = await rail.locator('[aria-current="step"]').getAttribute('data-step', { timeout: 120_000 })
  await rail.locator('[data-step="volume"]').click()
  const place = p.getByTestId('place-tower')
  if (await place.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await place.click()
    await p.getByTestId('place-first-tower').waitFor({ state: 'detached', timeout: 30_000 })
    await p.keyboard.press('Escape') // stop placing: the tower stays where it was put
  }
  if (!stay && step && step !== 'volume') await rail.locator(`[data-step="${step}"]`).click()
}

/** Opens a design tool in the left panel: its icon is a tab, and its controls show below the row of icons. */
export async function openDesignTool(p: Page, id: string) {
  const tile = p.locator(`[role="tab"][data-tool="${id}"]`).first()
  await tile.waitFor({ timeout: 60_000 })
  if ((await tile.getAttribute('aria-selected')) !== 'true') await tile.click()
  await p.locator(`[data-tool-body="${id}"]`).waitFor({ timeout: 60_000 })
}
