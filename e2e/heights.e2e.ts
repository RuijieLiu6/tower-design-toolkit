// Vista height model in Real Vancouver (after Vista v37, Ruijie Liu), driven like a user: the Height suggestion tool
// on the study tower, the "Height references & suggestion" results, and the map layer in its three views with the
// readout under the cursor. Screenshots go to test-results/heights/.
import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { openDesignTool, placeStartingTower } from './helpers'

const SHOTS = join(process.cwd(), 'test-results', 'heights')
mkdirSync(SHOTS, { recursive: true })

async function openCity(p: Page) {
  await p.addInitScript(() => { try { localStorage.setItem('ts.landing.skip', '0'); localStorage.setItem('ts.onboarding.seen', '1') } catch { /* ignore */ } })
  await p.goto('/#/guided')
  await p.waitForSelector('#root > *', { timeout: 60_000 })
  await p.getByRole('button', { name: 'Start designing' }).click({ timeout: 8000 }).catch(() => {})
  await p.getByRole('tab', { name: 'Real Vancouver' }).or(p.getByRole('button', { name: 'Real Vancouver' })).first().click()
  await p.waitForTimeout(5000)
  await p.getByRole('button', { name: 'Start designing' }).click({ timeout: 3000 }).catch(() => {})
}
const section = (p: Page, title: RegExp | string) => p.locator('section').filter({ has: p.getByRole('heading', { name: title }) })

test('height suggestion, results and the map layer in Real Vancouver', async ({ page }) => {
  test.setTimeout(720_000) // SwiftShader draws the city, cone volumes included, at seconds a frame
  await openCity(page)

  // 1. The design tool on the study tower (left panel, Volume step, Real Vancouver only). A project opens with no tower
  // (6 Nov): place the study tower first, as a user does.
  await placeStartingTower(page, { stay: true })
  await openDesignTool(page, 'height-suggestion')
  const tool = page.locator('[role="tab"][data-tool="height-suggestion"]')
  await expect(page.getByText(/(Suggested|Cones allow) up to/).first()).toBeVisible({ timeout: 60_000 })
  await expect(page.getByText(/Set by /).first()).toBeVisible()
  await tool.scrollIntoViewIfNeeded()
  await page.screenshot({ path: join(SHOTS, '01-tool.png') })

  // 2. The node's results ("Show results for" in the right panel).
  await page.getByRole('tab', { name: /Results/ }).click().catch(() => {})
  await page.locator('#results-for').selectOption('built.heights')
  const sw = page.getByRole('switch', { name: 'Use Height references & suggestion' })
  if (await sw.count() && (await sw.first().getAttribute('aria-checked')) === 'false') await sw.first().click()
  await expect(section(page, 'Zoning height reference')).toBeVisible({ timeout: 60_000 })
  await expect(section(page, 'View cones over the tower')).toBeVisible()
  await page.screenshot({ path: join(SHOTS, '02-results.png') })

  // 3. The map layer: suggestion around the tower, then zoning and cones downtown.
  await section(page, /Height suggestion ·/).getByRole('button', { name: 'Suggestion' }).click()
  const dock = page.getByRole('button', { name: /Height-limit surface & cone parameters/ }).first()
  // Since the Vista look (3 Nov) the layer dock sits behind the viewport's Layers button and starts closed, as in Vista.
  if (!(await dock.count())) await page.getByRole('button', { name: 'Layers', exact: true }).first().click()
  await expect(dock).toBeVisible({ timeout: 15_000 })
  if ((await dock.getAttribute('aria-expanded')) === 'false') await dock.click()
  await expect(page.getByText(/Suggested height above the ground/).first()).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(4000)
  await page.screenshot({ path: join(SHOTS, '03-layer-suggestion-site.png') })
  // The layer's area button in the dock (the Site step's map also names Downtown; that name is not a button).
  await page.getByRole('complementary', { name: 'Layers & context' }).getByRole('button', { name: 'Downtown', exact: true }).click()
  await page.getByRole('button', { name: 'Zoning heights', exact: true }).first().click()
  await expect(page.getByText(/Basic zoning height, above the by-law grade/).first()).toBeVisible()
  await page.waitForTimeout(6000)
  await page.screenshot({ path: join(SHOTS, '04-layer-zoning-downtown.png') })
  await page.getByRole('button', { name: 'View cones', exact: true }).first().click()
  await expect(page.getByText(/White stripes: a Vista study surface is lowest/).first()).toBeVisible()
  await page.waitForTimeout(6000)
  await page.screenshot({ path: join(SHOTS, '05-layer-cones-downtown.png') })

  // 4. The readout: hover over the canvas until it answers.
  await page.getByRole('button', { name: 'Suggestion', exact: true }).first().click()
  await page.waitForTimeout(5000)
  const box = (await page.locator('canvas').first().boundingBox())!
  let read = ''
  for (const [fx, fy] of [[0.3, 0.55], [0.35, 0.5], [0.25, 0.6], [0.4, 0.45], [0.3, 0.4], [0.2, 0.5]]) {
    await page.mouse.move(box.x + box.width * fx, box.y + box.height * fy)
    await page.waitForTimeout(1500)
    read = await page.getByText(/Suggested height here|Cones allow up to|No suggestion here|No view-cone limit/).first().textContent({ timeout: 1000 }).catch(() => '') ?? ''
    if (read) break
  }
  await page.screenshot({ path: join(SHOTS, '06-readout.png') })
  expect(read, 'the readout answers under the cursor').not.toBe('')
})
