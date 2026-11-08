// Interface layout (3 Nov): design tools on the left, analysis results on the right, the node switches as an icon bar
// at the bottom. Checks the structure on the demo project and saves one 1440 × 900 screenshot per stage to
// 04 Tool Plan/overnight/layout-2026-11-03/. Run: node node_modules/playwright/cli.js test e2e/layout.e2e.ts
import { openLibrary } from './helpers'
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
  // The cover comes first since 7 Nov: its Enter leads to the landing page, which holds the demo button.
  await p.getByTestId('intro-enter').click()
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

  // Form (8 Nov): the phase panel left (its workflow, then the open tool's controls), results right, the whole workflow
  // along the bottom; every check's switch is in the Library beside the phase row.
  await expect(tools).toHaveAttribute('data-testid', 'phase-panel')
  await p.getByRole('navigation', { name: 'Design process' }).locator('[data-step="volume"]').click()
  await expect(tools.getByRole('heading', { name: 'Form', exact: true })).toBeVisible()
  await expect(tools.getByRole('tab', { name: 'Massing', exact: true })).toBeVisible()
  await expect(results.getByRole('tab', { name: 'Results', exact: true })).toBeVisible()
  await expect(results.getByRole('tab', { name: 'Design' })).toHaveCount(0)
  await expect(p.getByTestId('workflow-dock')).toHaveCount(0) // no permanent workflow strip (8 Nov): Overview on demand
  await expect(p.getByTestId('workflow-overview')).toHaveCount(0)
  const lib = await openLibrary(p)
  expect(await lib.getByRole('switch').count()).toBeGreaterThanOrEqual(17)
  await expect(lib.getByRole('switch', { name: 'Use VTC hard rules', exact: true })).toBeVisible()
  await lib.getByRole('button', { name: 'Close the node library' }).click()
  await p.screenshot({ path: join(OUT, 'massing-1440x900.png') })

  // Schematic: Core & floors leads the tools; the bar adds the Schematic checks.
  await stage(p, '2')
  await expect(tools.getByRole('tab', { name: 'Core & floors', exact: true })).toBeVisible()
  const lib2 = await openLibrary(p)
  await expect(lib2.getByRole('switch', { name: 'Use Core & lift check', exact: true })).toBeVisible()
  await lib2.getByRole('button', { name: 'Close the node library' }).click()
  await p.screenshot({ path: join(OUT, 'schematic-1440x900.png') })

  // Present: the phase panel holds the shots (Frame and capture); the right panel has Present and Render before the results.
  await stage(p, '3')
  await expect(tools).toHaveAttribute('data-phase', 'present')
  await expect(tools.getByTestId('filmstrip')).toBeVisible()
  const present = p.getByRole('complementary', { name: 'Present and results' })
  await expect(present.getByRole('tab', { name: 'Present' })).toHaveAttribute('aria-selected', 'true')
  await expect(present.getByRole('tab', { name: 'Results', exact: true })).toBeVisible()
  await p.screenshot({ path: join(OUT, 'present-1440x900.png') })
})
