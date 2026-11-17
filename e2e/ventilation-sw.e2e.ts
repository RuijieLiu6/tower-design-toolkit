// Natural ventilation potential (the Sun & Wind Studio port, engine 3) as a node of the guided app: switched on from the
// library in Schematic on the competition site, it runs her hourly ventilation study in a worker over the tower's
// occupied floors and shows the ASHRAE 62.1 readings, the hours the windows can do the work by month, by floor and by
// week and hour, and the flagged lines; switching to single-sided ventilation with the adaptive band reruns it.
// Run: node node_modules/playwright/cli.js test -c playwright.edge.config.ts e2e/ventilation-sw.e2e.ts
import { expect, test, type Page } from '@playwright/test'
import { openResultDetails, placeStartingTower, showCheck } from './helpers'

const NODE = 'Natural ventilation potential (Sun & Wind Studio)'

async function open(p: Page) {
  await p.addInitScript(() => { try { localStorage.setItem('ts.landing.skip', '0'); localStorage.setItem('ts.onboarding.seen', '1'); localStorage.removeItem('ts.ventilationSW') } catch { /* private mode */ } })
  await p.addLocatorHandler(p.getByRole('dialog').filter({ has: p.locator('#ob-title') }), async (d) => { await d.getByRole('button', { name: 'Start designing' }).click() })
  await p.goto('/#/guided')
  await p.getByRole('navigation', { name: 'Design process' }).waitFor({ timeout: 120_000 })
  await p.getByRole('tab', { name: 'Competition site' }).or(p.getByRole('button', { name: 'Competition site' })).first().click({ timeout: 120_000 })
  await placeStartingTower(p, { stay: true })
  // The node belongs to Schematic (the library lists the checks of the phases reached).
  await p.keyboard.press('2')
  await p.waitForTimeout(1500)
}

test('natural ventilation: 62.1 readings, hours by month, floor and week, and a single-sided adaptive rerun', async ({ page: p }) => {
  test.setTimeout(300_000)
  await open(p)
  await showCheck(p, NODE)
  const card = p.getByTestId('ventilation-sw-card')
  await expect(card).toBeVisible({ timeout: 60_000 })
  const status = p.getByTestId('ventilation-sw-status')
  await expect(status).toContainText(/Evaluated|current model/i, { timeout: 120_000 })
  await openResultDetails(p)
  await expect(p.getByTestId('ventilation-sw-key')).toContainText('Openable area')
  await expect(p.getByTestId('ventilation-sw-bars')).toBeVisible()
  await expect(p.getByTestId('ventilation-sw-carpet')).toBeVisible()
  await expect(card).toContainText('Floor within 8 m of an operable opening')
  await expect(card).toContainText('Hours the windows can do the work')
  await expect(card).toContainText('ASHRAE 62.1')
  await expect(card).toContainText('Sun & Wind Studio')
  await expect(card).not.toContainText(/\bVerified\b/)
  const before = await p.getByTestId('ventilation-sw-key').innerText()
  await card.screenshot({ path: 'test-results/ventilation-sw-card.png' })
  // single-sided with the adaptive band: a rerun with other hours
  await p.getByTestId('ventilation-sw-mode').selectOption('single')
  await card.locator('select').filter({ has: p.locator('option', { hasText: 'ASHRAE 55 adaptive' }) }).selectOption('adaptive')
  await expect(status).toContainText(/Evaluated|current model/i, { timeout: 120_000 })
  await openResultDetails(p)
  await expect(card).toContainText('ASHRAE 55 adaptive band')
  expect(await p.getByTestId('ventilation-sw-key').innerText()).not.toBe(before)
  await p.screenshot({ path: 'test-results/ventilation-sw.png', fullPage: false })
})
