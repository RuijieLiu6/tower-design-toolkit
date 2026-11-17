// Energy use: TEUI / TEDI / GHGI (the Sun & Wind Studio port, engine 4) as a node of the guided app: switched on from the
// library in Schematic on the competition site, it runs the daylight port for dimming and then her hourly 5R1C model in a
// worker, and shows TEUI, TEDI and GHGI against her program-weighted targets, the end uses by month, each program, the
// heat-loss paths and the flagged lines; switching the plant to a gas boiler reruns it and raises GHGI.
// Run: node node_modules/playwright/cli.js test -c playwright.edge.config.ts e2e/energy-sw.e2e.ts
import { expect, test, type Page } from '@playwright/test'
import { openResultDetails, placeStartingTower, showCheck } from './helpers'

const NODE = 'Energy use: TEUI / TEDI / GHGI (Sun & Wind Studio)'

async function open(p: Page) {
  await p.addInitScript(() => { try { localStorage.setItem('ts.landing.skip', '0'); localStorage.setItem('ts.onboarding.seen', '1'); localStorage.removeItem('ts.energySW') } catch { /* private mode */ } })
  await p.addLocatorHandler(p.getByRole('dialog').filter({ has: p.locator('#ob-title') }), async (d) => { await d.getByRole('button', { name: 'Start designing' }).click() })
  await p.goto('/#/guided')
  await p.getByRole('navigation', { name: 'Design process' }).waitFor({ timeout: 120_000 })
  await p.getByRole('tab', { name: 'Competition site' }).or(p.getByRole('button', { name: 'Competition site' })).first().click({ timeout: 120_000 })
  await placeStartingTower(p, { stay: true })
  await p.keyboard.press('2') // the node belongs to Schematic
  await p.waitForTimeout(1500)
}
// textContent, not innerText: the card folds again on a rerun, and a folded card's innerText is empty
const ghgiOf = async (p: Page) => parseFloat(/GHGI\s*([\d.]+)/.exec((await p.getByTestId('energy-sw-key').textContent()) ?? '')?.[1] ?? 'NaN')

test('energy use: TEUI / TEDI / GHGI against her targets, end uses, programs, losses, and a gas rerun', async ({ page: p }) => {
  test.setTimeout(300_000)
  await open(p)
  await showCheck(p, NODE)
  const card = p.getByTestId('energy-sw-card')
  await expect(card).toBeVisible({ timeout: 60_000 })
  const status = p.getByTestId('energy-sw-status')
  await expect(status).toContainText(/Evaluated|current model/i, { timeout: 180_000 })
  await openResultDetails(p)
  await expect(p.getByTestId('energy-sw-key')).toContainText('TEUI')
  await expect(p.getByTestId('energy-sw-monthly')).toBeVisible()
  await expect(p.getByTestId('energy-sw-loss')).toBeVisible()
  await expect(card).toContainText('Total energy use intensity, TEUI')
  await expect(card).toContainText('Greenhouse gas intensity, GHGI')
  await expect(card).toContainText('Sun & Wind Studio')
  await expect(card).not.toContainText(/\bVerified\b/)
  const ghgiHp = await ghgiOf(p)
  await card.screenshot({ path: 'test-results/energy-sw-card.png' })
  await p.getByTestId('energy-sw-heat').selectOption('gas')
  // the rerun starts after a short debounce: wait for the new GHGI rather than the old status line
  await expect.poll(() => ghgiOf(p), { timeout: 180_000 }).toBeGreaterThan(ghgiHp)
  await expect(status).toContainText(/Evaluated|current model/i)
  await p.screenshot({ path: 'test-results/energy-sw.png', fullPage: false })
})
