// Daylight sDA / ASE (the Sun & Wind Studio port, engine 2) as a node of the guided app: switched on from the library on
// the competition site, it runs her climate-based daylight in a worker over the tower's occupied floors and shows sDA and
// ASE per floor, the key readings with their flags and sources, and a floor plan; a winter ASE period reruns it.
// Run: node node_modules/playwright/cli.js test -c playwright.edge.config.ts e2e/daylight-sw.e2e.ts
import { expect, test, type Page } from '@playwright/test'
import { openResultDetails, placeStartingTower, showCheck } from './helpers'

const NODE = 'Daylight sDA / ASE (Sun & Wind Studio)'

async function open(p: Page) {
  await p.addInitScript(() => { try { localStorage.setItem('ts.landing.skip', '0'); localStorage.setItem('ts.onboarding.seen', '1'); localStorage.removeItem('ts.daylightSW') } catch { /* private mode */ } })
  await p.addLocatorHandler(p.getByRole('dialog').filter({ has: p.locator('#ob-title') }), async (d) => { await d.getByRole('button', { name: 'Start designing' }).click() })
  await p.goto('/#/guided')
  await p.getByRole('navigation', { name: 'Design process' }).waitFor({ timeout: 120_000 })
  await p.getByRole('tab', { name: 'Competition site' }).or(p.getByRole('button', { name: 'Competition site' })).first().click({ timeout: 120_000 })
  await placeStartingTower(p, { stay: true })
  // The node belongs to Schematic (the library lists the checks of the phases reached): go there as a user does.
  await p.keyboard.press('2')
  await p.waitForTimeout(1500)
}

test('daylight sDA / ASE: per-floor bars, sourced readings, a floor plan, and a winter ASE rerun', async ({ page: p }) => {
  test.setTimeout(300_000)
  await open(p)
  await showCheck(p, NODE)
  const card = p.getByTestId('daylight-sw-card')
  await expect(card).toBeVisible({ timeout: 60_000 })
  const status = p.getByTestId('daylight-sw-status')
  await expect(status).toContainText(/Evaluated|current model/i, { timeout: 120_000 })
  await expect(status).toContainText(/context loaded/)
  await openResultDetails(p)
  await expect(p.getByTestId('daylight-sw-key')).toContainText(/sDA300\/50%/)
  await expect(p.getByTestId('daylight-sw-bars')).toBeVisible()
  await expect(card).toContainText('Spatial daylight autonomy')
  await expect(card).toContainText('Annual sunlight exposure')
  await expect(card).toContainText('Mean daylight factor')
  await expect(card).toContainText('Sun & Wind Studio')
  await expect(card).toContainText('LEED v4.1')
  // every reading carries a flag and none claims verified
  await expect(card).not.toContainText(/\bVerified\b/)
  // the plan of the weakest floor, then its hours of direct sun
  await expect(p.getByTestId('daylight-sw-plan')).toBeVisible()
  await card.getByRole('radio', { name: 'Direct sun' }).click()
  await expect(p.getByTestId('daylight-sw-plan')).toHaveAttribute('aria-label', /direct sun/)
  await card.screenshot({ path: 'test-results/daylight-sw-card.png' })
  // a winter ASE period reruns the study
  await card.locator('select').filter({ has: p.locator('option', { hasText: 'Winter (Dec–Feb)' }) }).selectOption({ label: 'Winter (Dec–Feb)' })
  await expect(status).toContainText(/Evaluated|current model/i, { timeout: 120_000 })
  await openResultDetails(p)
  await expect(card).toContainText(/Dec 1 – Feb 28/)
  await p.screenshot({ path: 'test-results/daylight-sw.png', fullPage: false })
})
