// Interface layout (3 Nov): design tools on the left, analysis results on the right, the node switches as an icon bar
// at the bottom. Checks the structure on the demo project and saves one 1440 × 900 screenshot per stage to
// 04 Tool Plan/overnight/layout-2026-11-03/. Run: node node_modules/playwright/cli.js test e2e/layout.e2e.ts
import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const OUT = resolve(process.cwd(), '..', '04 Tool Plan', 'overnight', 'layout-2026-11-03')
mkdirSync(OUT, { recursive: true })
test.use({ viewport: { width: 1440, height: 900 } })
test.describe.configure({ timeout: 5 * 60_000 })

async function dismiss(p: Page) {
  if (await p.locator('[aria-labelledby="ob-title"]').count()) await p.getByRole('button', { name: 'Start designing' }).click({ timeout: 3000 }).catch(() => p.keyboard.press('Escape'))
}

/** Landing → "Open the demo project" → the guided app on the competition site. */
async function demo(p: Page) {
  await p.addInitScript(() => { try { localStorage.setItem('ts.landing.skip', '0'); localStorage.setItem('ts.onboarding.seen', '1') } catch { /* ignore */ } })
  await p.goto('/#/start')
  await p.getByRole('button', { name: 'Open the demo project' }).click()
  await p.waitForURL(/#\/guided/)
  await p.waitForTimeout(2500)
  await dismiss(p)
  await p.getByRole('tab', { name: 'Competition site' }).first().click()
  await p.waitForTimeout(1500)
  await dismiss(p)
}

async function stage(p: Page, key: '1' | '2' | '3') {
  await p.mouse.move(720, 400)
  await p.keyboard.press(key)
  await p.waitForTimeout(2500)
  await p.evaluate(() => window.dispatchEvent(new Event('resize')))
  await p.waitForTimeout(800)
}

test('Massing, Schematic and Present at 1440 × 900', async ({ page: p }) => {
  await demo(p)
  const tools = p.getByRole('complementary', { name: 'Design tools' })
  const results = p.getByRole('complementary', { name: 'Results and evidence' })
  const bar = p.getByRole('toolbar', { name: 'Checks: switch each on or off' })

  // Massing: tools left (the Form step's icons, 6 Nov), results right, every Massing check as an icon switch at the bottom.
  await expect(tools.getByRole('heading', { name: 'Design tools' })).toBeVisible()
  await p.getByRole('navigation', { name: 'Design process' }).locator('[data-step="volume"]').click()
  await expect(tools.getByRole('tab', { name: 'Massing', exact: true })).toBeVisible()
  await expect(results.getByRole('tab', { name: 'Results & evidence' })).toBeVisible()
  await expect(results.getByRole('tab', { name: 'Design' })).toHaveCount(0)
  expect(await bar.getByRole('switch').count()).toBeGreaterThanOrEqual(17)
  await bar.getByRole('switch', { name: 'Use VTC hard rules', exact: true }).hover()
  await expect(p.getByRole('tooltip')).toContainText('VTC hard rules')
  await p.screenshot({ path: join(OUT, 'massing-1440x900.png') })

  // Schematic: Core & floors leads the tools; the bar adds the Schematic checks.
  await stage(p, '2')
  await expect(tools.getByRole('tab', { name: 'Core & floors', exact: true })).toBeVisible()
  await expect(bar.getByRole('switch', { name: 'Use Core & lift check', exact: true })).toBeVisible()
  await bar.getByRole('switch', { name: 'Use Core & lift check', exact: true }).hover()
  await p.screenshot({ path: join(OUT, 'schematic-1440x900.png') })

  // Present: the shot strip stays on the left; the right panel has Present (and Render once it exists) before the results.
  await stage(p, '3')
  await expect(p.getByRole('complementary', { name: 'Captured shots' })).toBeVisible()
  const present = p.getByRole('complementary', { name: 'Present and results' })
  await expect(present.getByRole('tab', { name: 'Present' })).toHaveAttribute('aria-selected', 'true')
  await expect(present.getByRole('tab', { name: 'Results & evidence' })).toBeVisible()
  await p.screenshot({ path: join(OUT, 'present-1440x900.png') })
})
