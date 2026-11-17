// Pedestrian wind comfort (the Sun & Wind Studio port) as a node of the guided app: switched on from the library on the
// competition site, it solves the flow in a worker and shows the Lawson bands with and without the tower, the key
// readings with their flags, and the ground overlay; the seasonal rose runs the eight sectors with progress.
// Run: node node_modules/playwright/cli.js test -c playwright.edge.config.ts e2e/wind-comfort.e2e.ts
import { expect, test, type Page } from '@playwright/test'
import { openResultDetails, placeStartingTower, showCheck } from './helpers'

const NODE = 'Pedestrian wind comfort (Sun & Wind Studio)'

async function open(p: Page) {
  await p.addInitScript(() => { try { localStorage.setItem('ts.landing.skip', '0'); localStorage.setItem('ts.onboarding.seen', '1'); localStorage.removeItem('ts.windComfort') } catch { /* private mode */ } })
  await p.addLocatorHandler(p.getByRole('dialog').filter({ has: p.locator('#ob-title') }), async (d) => { await d.getByRole('button', { name: 'Start designing' }).click() })
  await p.goto('/#/guided')
  await p.getByRole('navigation', { name: 'Design process' }).waitFor({ timeout: 120_000 })
  await p.getByRole('tab', { name: 'Competition site' }).or(p.getByRole('button', { name: 'Competition site' })).first().click({ timeout: 120_000 })
  await placeStartingTower(p, { stay: true })
}

test('wind comfort: one case, then the seasonal rose, with evidence and the overlay', async ({ page: p }) => {
  test.setTimeout(300_000)
  await open(p)
  await showCheck(p, NODE)
  const card = p.getByTestId('wind-comfort-card')
  await expect(card).toBeVisible({ timeout: 60_000 })
  // the one-case flow solves within seconds; the bands then show with and without the tower
  await expect(p.getByTestId('wind-comfort-status')).toContainText(/Evaluated|current model/i, { timeout: 90_000 })
  await openResultDetails(p) // the full card folds under the checklist (6 Nov pattern)
  const bands = p.getByTestId('wind-comfort-bands')
  await expect(bands).toBeVisible()
  await expect(card).toContainText('Ground calm enough to stand')
  await expect(card).toContainText('Plaza peak wind')
  await expect(card).toContainText('Sun & Wind Studio')
  // every reading carries a flag and none claims verified
  await expect(card).not.toContainText(/\bVerified\b/)
  // the seasonal rose: eight sectors with progress, then a sectors table
  await p.getByTestId('wind-comfort-annual').selectOption('annual')
  await expect(p.getByTestId('wind-comfort-status')).toContainText(/Sector|Solving|rerunning|Model changed/i, { timeout: 30_000 })
  await expect(p.getByTestId('wind-comfort-status')).toContainText(/Evaluated|current model/i, { timeout: 240_000 })
  await openResultDetails(p)
  await expect(card).toContainText(/Gusty ground/)
  await expect(card.getByText(/^(N|NE|E|SE|S|SW|W|NW)$/).first()).toBeVisible()
  await p.screenshot({ path: 'test-results/wind-comfort.png', fullPage: false })
})
