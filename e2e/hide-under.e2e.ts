// Existing buildings under a placed tower disappear by default (Ruijie, 3 Nov: "make the overlapped existing disappear so
// that there is not overlap of the existing building and the proposed building"). Driven like a user: a fresh browser
// opens Real Vancouver, the study tower goes over an existing downtown tower, the Layers dock says what is hidden and why
// (hypothetical removal), "Show the existing buildings again" brings them back in one click and is remembered after a
// reload. Before / after screenshots go to 04 Tool Plan/evaluation/2026-11-04-hide-under/.
import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const SHOTS = join(process.cwd(), '..', '04 Tool Plan', 'evaluation', '2026-11-04-hide-under')
mkdirSync(SHOTS, { recursive: true })
// Real Vancouver frames are slow in software WebGL (SwiftShader, the project default): a screenshot can take minutes.
const SHOT = { timeout: 240_000 }
/** An existing downtown tower (the 132 m LiDAR tower near Burrard and Georgia, local frame) and a 60 m study tower over it. */
const SITE = { x: -845, y: 1072, width: 30, depth: 40, height: 60 }

/** Import one of the app's own modules (the instance the page loaded) by a pattern on its URL. */
const mod = (p: Page, pattern: string) => p.evaluate((pattern) => performance.getEntriesByType('resource').map((e) => e.name).filter((n) => new RegExp(pattern).test(n)).pop() ?? null, pattern)

/** Each test gets a new browser context, so its storage starts empty (no remembered choice). Init scripts persist across
 *  navigations, so add it once and never let it touch `ts.hideUnderDesign`. */
async function openCity(p: Page, first: boolean) {
  if (first) await p.addInitScript(() => {
    performance.setResourceTimingBufferSize(10_000)
    try { localStorage.setItem('ts.landing.skip', '0'); localStorage.setItem('ts.onboarding.seen', '1') } catch { /* ignore */ }
  })
  // The same URL with only a hash is not a new page load: reload the second time.
  if (first) await p.goto('/#/guided'); else await p.reload()
  await p.waitForSelector('#root > *', { timeout: 60_000 })
  await p.getByRole('button', { name: 'Start designing' }).click({ timeout: 8000 }).catch(() => {})
  await p.getByRole('tab', { name: 'Real Vancouver' }).or(p.getByRole('button', { name: 'Real Vancouver' })).first().click()
  await p.waitForTimeout(5000)
  await p.getByRole('button', { name: 'Start designing' }).click({ timeout: 3000 }).catch(() => {})
}

/** The dock's "Existing buildings under the design" section, opened. */
async function existingSection(p: Page) {
  // The dock remembers being collapsed: open it with its "Layers" button first.
  await p.locator('#vp-dock, [aria-controls="vp-dock"]').first().waitFor({ timeout: 120_000 })
  const opener = p.locator('[aria-controls="vp-dock"][aria-expanded="false"]')
  if (await opener.count()) await opener.first().click()
  const dock = p.locator('#vp-dock')
  const head = dock.getByRole('button', { name: /Existing buildings under the design/ })
  await expect(head).toBeVisible({ timeout: 120_000 })
  if ((await head.getAttribute('aria-expanded')) === 'false') await head.click()
  return { dock, head }
}

test('a tower over an existing building hides it by default; one click shows it again, remembered', async ({ page }) => {
  test.setTimeout(900_000)
  await openCity(page, true)
  const storeUrl = await mod(page, '/src/store\\.ts')
  const switchUrl = await mod(page, '/src/lib/hideUnderDesign\\.ts')
  expect(storeUrl && switchUrl).toBeTruthy()

  // A fresh browser starts with the buildings under the design hidden, and nothing stored yet.
  const fresh = await page.evaluate(async ({ switchUrl }) => {
    const { useHideUnderDesign } = await import(/* @vite-ignore */ switchUrl!)
    return { on: useHideUnderDesign.getState().on, stored: localStorage.getItem('ts.hideUnderDesign') }
  }, { switchUrl })
  expect(fresh).toEqual({ on: true, stored: null })

  // Put the study tower over the existing tower, as "Place on map" would, and look at it from the south-west.
  await page.evaluate(async ({ storeUrl, SITE }) => {
    const { useStore } = await import(/* @vite-ignore */ storeUrl!)
    const s = useStore.getState(), t = s.towers.city[0]
    s.updateTower(t.id, { x: SITE.x, y: SITE.y, width: SITE.width, depth: SITE.depth, rotation: 0, height: SITE.height, podiumHeight: 0 })
    s.set({ selectedTower: t.id, cameraRequest: { position: [SITE.x - 175, SITE.y - 215, 330], target: [SITE.x + 20, SITE.y, 40], fov: 40 } })
  }, { storeUrl, SITE })
  await page.waitForTimeout(4000)

  const { dock, head } = await existingSection(page)
  await expect(dock).toContainText(/Hidden: [\d,]+ existing building footprints? under /, { timeout: 60_000 })
  await expect(dock).toContainText('Hypothetical removal; not evidence of vacancy or redevelopment eligibility.')
  await expect(head).toContainText(/hidden/)
  await page.screenshot({ path: join(SHOTS, '2-after-hidden-by-default.png'), ...SHOT })

  // One click shows them again (the overlap the request is about), and the choice is stored.
  await dock.getByRole('button', { name: 'Show the existing buildings again' }).click()
  await page.waitForTimeout(3000)
  await expect(dock).toContainText(/All existing buildings are drawn/)
  expect(await page.evaluate(() => localStorage.getItem('ts.hideUnderDesign'))).toBe('0')
  await page.screenshot({ path: join(SHOTS, '1-before-existing-shown.png'), ...SHOT })

  // Remembered in this browser after a reload; one click turns hiding back on.
  await openCity(page, false)
  const again = await existingSection(page)
  await expect(again.dock).toContainText(/All existing buildings are drawn/, { timeout: 60_000 })
  await again.dock.getByRole('button', { name: 'Hide the existing buildings under the design' }).click()
  await expect(again.dock).toContainText(/Hidden: [\d,]+ existing building footprints? under /, { timeout: 60_000 })
  expect(await page.evaluate(() => localStorage.getItem('ts.hideUnderDesign'))).toBe('1')
})
