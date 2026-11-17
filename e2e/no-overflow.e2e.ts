// No horizontal overflow (Ruijie, 17 Nov): at 1440 × 900 and 1280 × 800 the page is never wider than the window, in
// Model and in Presentation, on the competition site and on Real Vancouver, and the top bar's right end (Edit
// workflow, More) stays inside the window. Presentation's extra chips used to push the top bar past 1440 px.
import { expect, test, type Page } from '@playwright/test'
import { placeStartingTower } from './helpers'

const radio = (p: Page, name: 'Model' | 'Presentation') => p.getByRole('radiogroup', { name: 'Model or Presentation' }).getByRole('radio', { name })
const widths = (p: Page) => p.evaluate(() => ({ doc: document.documentElement.scrollWidth, body: document.body.scrollWidth, win: window.innerWidth }))

async function expectFits(p: Page, where: string) {
  await p.waitForTimeout(400)
  const w = await widths(p)
  expect(w.doc, `${where}: document ${w.doc} > window ${w.win}`).toBeLessThanOrEqual(w.win)
  expect(w.body, `${where}: body ${w.body} > window ${w.win}`).toBeLessThanOrEqual(w.win)
  const more = p.locator('header').getByRole('button', { name: 'More', exact: true }).or(p.locator('header button').last())
  const box = (await more.first().boundingBox())!
  expect(box.x + box.width, `${where}: the top bar's right end`).toBeLessThanOrEqual(w.win)
}

for (const size of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }]) {
  test(`fits the window at ${size.width} × ${size.height}: both modes, both projects`, async ({ page: p }) => {
    test.setTimeout(420_000)
    await p.setViewportSize(size)
    await p.addInitScript(() => { try { localStorage.setItem('ts.landing.skip', '1'); localStorage.setItem('ts.onboarding.seen', '1') } catch { /* ignore */ } })
    await p.goto('/#/guided')
    await p.waitForSelector('#root > *', { timeout: 60_000 })
    await p.getByRole('tab', { name: 'Competition site' }).or(p.getByRole('button', { name: 'Competition site' })).first().click({ timeout: 120_000 })
    await placeStartingTower(p, { stay: true })
    await expectFits(p, 'competition, Model')
    await radio(p, 'Presentation').click()
    await expect(radio(p, 'Presentation')).toHaveAttribute('aria-checked', 'true')
    await expectFits(p, 'competition, Presentation')
    await radio(p, 'Model').click()

    await p.getByRole('tab', { name: 'Real Vancouver' }).click()
    await p.waitForTimeout(4000)
    await p.getByRole('button', { name: 'Start designing' }).click({ timeout: 3000 }).catch(() => {})
    await expectFits(p, 'Real Vancouver, Model')
    await radio(p, 'Presentation').click()
    await expect(radio(p, 'Presentation')).toHaveAttribute('aria-checked', 'true')
    await expectFits(p, 'Real Vancouver, Presentation')
  })
}
