// Shared steps for the browser tests. A project opens with no tower (Ruijie, 6 Nov), so tests that read a tower place
// the starting tower first, the way a user does: Form step › "Place a tower", Esc to keep it where it lands.
import type { Page } from '@playwright/test'

/**
 * Places the open project's starting tower (if it has none). Goes back to the step the test was on, unless `stay`
 * (then the Form step stays open, where the tower tools are).
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

/**
 * Opens a design tool in the left panel: its icon is a tab under the phase's design node, and its controls show below
 * the row of icons. When the phase panel has a check open instead, its design node (the first row) is opened first.
 */
export async function openDesignTool(p: Page, id: string) {
  const tile = p.locator(`[role="tab"][data-tool="${id}"]`).first()
  if (!(await tile.isVisible().catch(() => false))) {
    const design = p.getByTestId('phase-rows').locator('[data-phase-node^="design."] [data-node]').first()
    if (await design.isVisible({ timeout: 30_000 }).catch(() => false)) await design.click()
  }
  await tile.waitFor({ timeout: 60_000 })
  if ((await tile.getAttribute('aria-selected')) !== 'true') await tile.click()
  await p.locator(`[data-tool-body="${id}"]`).waitFor({ timeout: 60_000 })
}

/**
 * Results open with a pass/fail checklist and fold the full cards under "Details, sources and settings" (6 Nov):
 * tests that read a card's words open the fold first. No fold (a check without result lines): nothing to do.
 */
export async function openResultDetails(p: Page) {
  const fold = p.getByTestId('result-details').first()
  if (!(await fold.count())) return
  if (!(await fold.evaluate((e) => (e as HTMLDetailsElement).open))) await fold.locator('summary').first().click()
}

/**
 * Switches a check on (every check's switch is in the node library, which opens from Library in the phase row, 8 Nov)
 * and shows its results ("Show results for" in the right panel).
 */
export async function showCheck(p: Page, name: string) {
  const lib = p.getByRole('dialog', { name: 'Node library' })
  if (!(await lib.isVisible().catch(() => false))) await p.getByTestId('library-button').click({ timeout: 120_000 })
  const sw = lib.getByRole('switch', { name: `Use ${name}`, exact: true })
  await sw.waitFor({ timeout: 30_000 })
  if ((await sw.getAttribute('aria-checked')) === 'false') await sw.click()
  await lib.getByRole('button', { name: 'Close the node library' }).click()
  await p.getByRole('tab', { name: /Results/ }).click().catch(() => {})
  await p.getByLabel('Show results for').selectOption({ label: name }).catch(() => {})
  await p.getByRole('tab', { name: /Results/ }).click().catch(() => {})
}
/** The library's switches (for counting them), with the library open. */
export async function openLibrary(p: Page) {
  const lib = p.getByRole('dialog', { name: 'Node library' })
  if (!(await lib.isVisible().catch(() => false))) await p.getByTestId('library-button').click({ timeout: 120_000 })
  return lib
}
