// Study site tools in Real Vancouver (after Vista v34, Ruijie Liu), driven like a user: draw a boundary by clicking the
// 3D view, close it with Enter, import a GeoJSON boundary, and read the exact envelope section. Screenshots go to
// test-results/vista-site/. Address search is not driven here: it needs the network and the user's consent.
import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { openDesignTool, placeStartingTower } from './helpers'

const SHOTS = join(process.cwd(), 'test-results', 'vista-site')
mkdirSync(SHOTS, { recursive: true })

async function openVista(p: Page) {
  await p.addInitScript(() => { performance.setResourceTimingBufferSize(10_000); try { localStorage.setItem('ts.landing.skip', '0'); localStorage.setItem('ts.onboarding.seen', '1'); localStorage.removeItem('ts.citySite') } catch { /* ignore */ } })
  await p.goto('/#/guided')
  await p.waitForSelector('#root > *', { timeout: 60_000 })
  await p.getByRole('button', { name: 'Start designing' }).click({ timeout: 8000 }).catch(() => {})
  await p.getByRole('tab', { name: 'Real Vancouver' }).or(p.getByRole('button', { name: 'Real Vancouver' })).first().click()
  await p.waitForTimeout(4000)
  await p.getByRole('button', { name: 'Start designing' }).click({ timeout: 3000 }).catch(() => {})
  // A project opens with no tower (6 Nov): place the study tower first, as a user does (a reload keeps it: autosave).
  await placeStartingTower(p)
  // Switching a node on in the bottom bar selects it; one already on is picked in "Show results for".
  const sw = p.getByRole('switch', { name: 'Use Vista view studies', exact: true })
  if ((await sw.getAttribute('aria-checked')) === 'false') await sw.click()
  else { await p.getByRole('tab', { name: /Results/ }).click().catch(() => {}); await p.getByLabel('Show results for').selectOption({ label: 'Vista view studies' }) }
  await p.getByRole('tab', { name: /Results/ }).click().catch(() => {})
  await p.waitForTimeout(1500)
}

/** Top-down camera over a local point, through the app's own store (as the user's "Inspect" buttons do). */
async function lookDown(p: Page, x: number, y: number) {
  await p.evaluate(async ({ x, y }) => {
    const url = performance.getEntriesByType('resource').map((e) => e.name).filter((n) => /\/src\/store\.ts/.test(n)).pop()!
    const { useStore } = await import(/* @vite-ignore */ url)
    useStore.getState().set({ cameraRequest: { position: [x, y - 2, 700], target: [x, y, 30], fov: 30 } })
  }, { x, y })
  await p.waitForTimeout(2500)
}

const section = (p: Page, title: string) => p.locator('section').filter({ has: p.getByRole('heading', { name: title, exact: true }) })

test('draw a study site on the plan, close it, read its area', async ({ page }) => {
  test.setTimeout(300_000)
  await openVista(page)
  await lookDown(page, 336, 156)
  await section(page, 'Site boundary').getByRole('button', { name: /Draw on the plan/ }).click()
  const box = (await page.locator('canvas').first().boundingBox())!
  // Left of centre: the Layers dock covers the right of the canvas, and a click on it is not a click on the plan.
  const cx = box.x + box.width * 0.3, cy = box.y + box.height / 2
  for (const [dx, dy] of [[-80, -70], [80, -70], [80, 70], [-80, 70]]) { await page.mouse.click(cx + dx, cy + dy); await page.waitForTimeout(600) }
  await page.keyboard.press('Enter')
  await page.waitForTimeout(1500)
  const text = (await section(page, 'Site boundary').innerText()).replace(/\s+/g, ' ')
  await page.screenshot({ path: join(SHOTS, 'drawn-site.png') })
  expect(text).toMatch(/[\d,]+ m² · perimeter [\d.,]+ m · 4 corners/)
  expect(text).toMatch(/Drawn on the plan \(4 corners\)/)
  await expect(section(page, 'Site area for FSR')).toContainText(/m² from the/)
})

test('import a GeoJSON site boundary with its provenance; the envelope section reports', async ({ page }) => {
  test.setTimeout(300_000)
  await openVista(page)
  const geo = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { name: 'Test lot' }, geometry: { type: 'Polygon', coordinates: [[[-123.11553, 49.28197], [-123.11512, 49.28197], [-123.11512, 49.28224], [-123.11553, 49.28224], [-123.11553, 49.28197]]] } }] }
  await page.locator('input[aria-label="Site boundary GeoJSON file"]').setInputFiles({ name: 'lot.geojson', mimeType: 'application/geo+json', buffer: Buffer.from(JSON.stringify(geo)) })
  await page.waitForTimeout(2500)
  // The Site step's start panel shows the same status (3 Nov); read the one in the Vista panel this test drives.
  await expect(page.getByRole('tabpanel', { name: 'Results & evidence' }).getByText(/Boundary imported: [\d,]+ m²/)).toBeVisible()
  await expect(section(page, 'Site boundary')).toContainText('GeoJSON lot.geojson (Test lot), EPSG:4326 → EPSG:26910')
  await expect(section(page, 'Exact geometry check (triangles)')).toContainText(/triangle/)
  await page.screenshot({ path: join(SHOTS, 'imported-site.png') })
  // The Program design tool's FSR now divides by the study site, says which area, and cites it (Program step).
  await page.getByRole('navigation', { name: 'Design process' }).locator('[data-step="program"]').click()
  await openDesignTool(page, 'program')
  // Since 6 Nov a figure with an area chip: "FSR total 1.23 · 11,225 m² · lots | boundary".
  await expect(section(page, 'Floor area (all towers, gross)')).toContainText(/FSR total\s*[\d.]+\s*[\d,]+ m² · (lots|boundary)/)
  await page.screenshot({ path: join(SHOTS, 'fsr-study-site.png') })
  // The site is part of the project now (citySite), so the autosave brings it back after a reload.
  await page.waitForTimeout(2000)
  await openVista(page)
  await expect(section(page, 'Site boundary')).toContainText('GeoJSON lot.geojson (Test lot)', { timeout: 20_000 })
})
