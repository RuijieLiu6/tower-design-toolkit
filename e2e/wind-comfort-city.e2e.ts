// Real Vancouver: the City buildings reach the wind comfort run (17 Nov review, finding 2). The first stage of the City
// data has terrain only; the run waits for the detailed buildings and counts them, so the card names how many went in.
// Run: node node_modules/playwright/cli.js test -c playwright.edge.config.ts e2e/wind-comfort-city.e2e.ts
import { expect, test } from '@playwright/test'
import { openResultDetails, placeStartingTower, showCheck } from './helpers'

test('Real Vancouver: wind comfort runs on the City buildings around the tower', async ({ page: p }) => {
  test.setTimeout(600_000)
  await p.addInitScript(() => { try { localStorage.setItem('ts.landing.skip', '0'); localStorage.setItem('ts.onboarding.seen', '1'); localStorage.removeItem('ts.windComfort') } catch { /* private mode */ } })
  await p.addLocatorHandler(p.getByRole('dialog').filter({ has: p.locator('#ob-title') }), async (d) => { await d.getByRole('button', { name: 'Start designing' }).click() })
  await p.goto('/#/guided')
  await expect(p.getByRole('tablist', { name: 'Project' }).getByRole('tab', { name: 'Real Vancouver' })).toHaveAttribute('aria-selected', 'true', { timeout: 120_000 })
  await p.getByTestId('use-default-site').click()
  await placeStartingTower(p, { stay: true })
  await showCheck(p, 'Pedestrian wind comfort (Sun & Wind Studio)')
  const status = p.getByTestId('wind-comfort-status')
  await expect(status).toContainText(/Evaluated|current model/i, { timeout: 300_000 })
  await openResultDetails(p) // the full card folds under the checklist
  const n = parseInt((await p.getByTestId('wind-comfort-buildings').textContent()) ?? '', 10)
  console.log('City buildings in the run:', n)
  expect(n).toBeGreaterThan(20)
  await p.screenshot({ path: 'test-results/wind-comfort-city.png', fullPage: false })
})
