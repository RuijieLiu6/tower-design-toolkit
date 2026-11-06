// The Site step (Ruijie, 3 Nov: "anyone open the website would start with pick the site"), driven like a first-time
// user: open the guided app with nothing saved → Site step in Real Vancouver → type an address and place the site →
// click a neighbourhood's name on the map → click the map → each menu action (replace a building, select several, use a lot, add the
// next lot = combine two lots, remove it, a box over lots, build the massing here) → Undo where it says so.
// The address services answer from canned replies (page.route), so nothing typed leaves the machine.
// Screenshots go to 04 Tool Plan/evaluation/2026-11-03-site-step/.
import { expect as base, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

// Real Vancouver in software WebGL: a frame can take seconds, so what the page shows gets time to appear.
const expect = base.configure({ timeout: 30_000 })

const SHOTS = join(process.cwd(), '..', '04 Tool Plan', 'evaluation', '2026-11-03-site-step')
mkdirSync(SHOTS, { recursive: true })
// Real Vancouver frames are slow in software WebGL (SwiftShader): a screenshot can take minutes.
const SHOT = { timeout: 240_000 }

// Two downtown lots that share a lot line (City parcels, 2026-10-27 snapshot), each with a building on it.
const HOMER = { x: 233.1, y: 5.9, lon: -123.11641323916025, lat: 49.280149048051, label: '777 Homer St' }
const GEORGIA = { x: 273.3, y: 46.5, label: '410 W Georgia St' }

/** Import one of the app's own modules (the instance the page loaded) by a pattern on its URL. */
const mod = (p: Page, pattern: string) => p.evaluate((pattern) => performance.getEntriesByType('resource').map((e) => e.name).filter((n) => new RegExp(pattern).test(n)).pop() ?? null, pattern)

async function cannedServices(p: Page) {
  await p.route('**/property-addresses/exports/json**', (r) => r.fulfill({ json: [
    { civic_number: '777', std_street: 'HOMER ST', geo_point_2d: { lon: HOMER.lon, lat: HOMER.lat } },
    { civic_number: '410', std_street: 'W GEORGIA ST', geo_point_2d: { lon: -123.11586137739108, lat: 49.28051480703126 } },
  ] }))
  await p.route('**/local-area-boundary/exports/json**', (r) => r.fulfill({ json: [{ name: 'Downtown', geo_point_2d: { lon: -123.11656726497581, lat: 49.280747072249724 } }] }))
  await p.route('**/geocoder.api.gov.bc.ca/**', (r) => r.fulfill({ json: { type: 'FeatureCollection', features: [] } }))
}

/** Screen position of a plan point on the ground, through the live camera. */
async function screenAt(p: Page, urls: { fiber: string; store: string }, x: number, y: number) {
  return p.evaluate(async ({ urls, x, y }) => {
    const f = await import(/* @vite-ignore */ urls.fiber)
    const { useStore } = await import(/* @vite-ignore */ urls.store)
    const canvas = document.querySelector('[data-viewport] canvas') as HTMLCanvasElement
    const st = f._roots.get(canvas).store.getState()
    const v = st.camera.position.clone().set(x, useStore.getState().groundElevation, -y).project(st.camera)
    const r = canvas.getBoundingClientRect()
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height }
  }, { urls, x, y })
}

const menu = (p: Page) => p.getByTestId('site-map-menu')
const toast = (p: Page) => p.getByTestId('site-toast')
const summary = (p: Page) => p.getByTestId('site-summary')

/**
 * Click a place name on the map (4 Nov: the names replace the neighbourhood list), from the City overview or, with
 * `view`, from a camera set first (a name the overview hides by Vista's overlap rule).
 */
async function clickPlace(p: Page, name: string, view?: () => Promise<void>) {
  if (view) await view()
  else await p.getByRole('toolbar', { name: 'Map mode' }).getByRole('button', { name: 'City', exact: true }).click()
  await p.waitForTimeout(3000)
  const label = p.locator(`[data-place="${name}"]`)
  await expect(label).toBeVisible()
  const b = (await label.boundingBox())!
  await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
  await expect(label).toHaveAttribute('data-hover', '')
  await p.mouse.click(b.x + b.width / 2, b.y + b.height / 2)
}

test('Site step: address, neighbourhood, map menu actions, combining two lots', async ({ page }) => {
  test.setTimeout(1_500_000)
  await page.addInitScript(() => { performance.setResourceTimingBufferSize(10_000); try { localStorage.setItem('ts.landing.skip', '0'); localStorage.setItem('ts.onboarding.seen', '1') } catch { /* ignore */ } })
  await cannedServices(page)
  await page.goto('/#/guided')
  await page.waitForSelector('#root > *', { timeout: 60_000 })

  // 1. A first open with nothing saved: the Site step alone is lit, Real Vancouver is open, the Site tool leads.
  const rail = page.getByRole('navigation', { name: 'Design process' })
  await expect(rail.getByRole('button', { name: 'Site' })).toHaveAttribute('aria-current', 'step')
  await expect(rail.getByRole('button', { name: 'Form' })).not.toHaveAttribute('aria-current', 'step')
  await expect(rail.getByRole('button', { name: 'Program' })).not.toHaveAttribute('aria-current', 'step')
  await expect(page.getByRole('tablist', { name: 'Project' }).getByRole('tab', { name: 'Real Vancouver' })).toHaveAttribute('aria-selected', 'true')
  // 5 Nov (Ruijie): no Real Vancouver / Competition choice inside the Site tool; the project is the top bar's switch.
  await expect(page.getByRole('radiogroup', { name: 'Where the site is' })).toHaveCount(0)
  await expect(page.getByTestId('tools-step')).toHaveText('· Site step')
  // 6 Nov (Ruijie): the Site step shows only its own tools, Site and Rhino import, as icons with key words.
  const toolTabs = page.getByRole('tablist', { name: 'Design tools' }).getByRole('tab')
  await expect(toolTabs).toHaveCount(2)
  await expect(toolTabs.nth(0)).toHaveAttribute('data-tool', 'site')
  await expect(toolTabs.nth(1)).toHaveAttribute('data-tool', 'rhino-import')
  await expect(toolTabs.nth(1)).toContainText('Import')
  // The city's buildings have loaded and the map menu answers clicks (SiteMapMenu marks the canvas).
  await page.locator('[data-viewport] canvas[data-site-map="ready"]').waitFor({ state: 'attached', timeout: 420_000 })
  await page.waitForTimeout(3000)
  const urls = { fiber: (await mod(page, '@react-three_fiber'))!, store: (await mod(page, '/src/store\\.ts'))! }
  expect(urls.fiber && urls.store).toBeTruthy()
  // A project opens with no tower (Ruijie, 6 Nov): the first one is placed later (4f).
  const towers0 = await page.evaluate(async (u) => { const { useStore } = await import(/* @vite-ignore */ u); return useStore.getState().towers.city.length }, urls.store)
  expect(towers0).toBe(0)
  await page.screenshot({ path: join(SHOTS, '01-first-open-site-step.png'), ...SHOT })

  // 2. Type an address (City civic address point, canned) and place the site on its lot.
  const palette = page.getByTestId('site-start')
  await palette.getByRole('button', { name: 'Search online' }).click()
  await palette.getByRole('combobox', { name: 'Address or neighbourhood' }).fill('777 Homer')
  await page.getByRole('option', { name: /777 Homer St/ }).click()
  await palette.getByRole('button', { name: 'Place site here' }).click()
  await expect(summary(page)).toContainText('777 Homer St', { timeout: 30_000 })
  await expect(summary(page)).toContainText(/existing buildings? shown as demolished/)
  await page.screenshot({ path: join(SHOTS, '02-address-placed.png'), ...SHOT })
  // The site as it stands is the right panel's Your site tab (5 Nov), opened by itself in the Site step.
  await expect(page.getByRole('tab', { name: 'Your site' })).toHaveAttribute('aria-selected', 'true')
  await page.getByTestId('site-info').getByRole('button', { name: 'Undo' }).click()
  await expect(summary(page)).toHaveCount(0)

  // 3. A neighbourhood's name on the map: the view flies there and marks it; the site does not move. The list in the
  // palette is gone (Ruijie, 4 Nov).
  await expect(palette.getByRole('group', { name: 'City local areas' })).toHaveCount(0)
  await clickPlace(page, 'Strathcona')
  await expect(toast(page)).toContainText('Strathcona is in view and marked')
  await expect(page.locator('[data-place="Strathcona"]')).toHaveAttribute('data-active', '')
  await expect(menu(page)).toHaveCount(0) // the name took the click, not the map menu
  await page.waitForTimeout(2500)
  await page.screenshot({ path: join(SHOTS, '03-neighbourhood.png'), ...SHOT })

  // The view fits the neighbourhood's boundary (Ruijie, 4 Nov), also one far from downtown that Vista's map does not
  // name, where the buildings were filled in from OpenStreetMap: every vertex of Kerrisdale's outline lands in the view.
  // Looking straight down on the south of the city, where Kerrisdale's name is not crowded out.
  await clickPlace(page, 'Kerrisdale', () => page.evaluate(async (u) => { const { useStore } = await import(/* @vite-ignore */ u); useStore.getState().set({ cameraRequest: { position: [-2900, -5000, 9000], target: [-2900, -4990, 40], fov: 40 } }) }, urls.store))
  await expect(toast(page)).toContainText('Kerrisdale is in view and marked')
  await page.waitForTimeout(2500)
  await page.screenshot({ path: join(SHOTS, '03b-neighbourhood-kerrisdale.png'), ...SHOT })
  const outline = await page.evaluate(async () => {
    const f = await (await fetch('./data/local_areas.json')).json() as { areas: { name: string; rings: [number, number][][] }[] }
    return f.areas.find((a) => a.name === 'Kerrisdale')!.rings.flat()
  })
  const box = (await page.locator('[data-viewport] canvas').boundingBox())!
  for (const [x, y] of outline.filter((_, i) => i % 3 === 0)) {
    const s = await screenAt(page, urls, x, y)
    expect(s.x).toBeGreaterThan(box.x - 2); expect(s.x).toBeLessThan(box.x + box.width + 2)
    expect(s.y).toBeGreaterThan(box.y - 2); expect(s.y).toBeLessThan(box.y + box.height + 2)
  }

  // Top-down over the two lots, so each click lands where we mean.
  await page.evaluate(async ({ u, x, y }) => { const { useStore } = await import(/* @vite-ignore */ u); useStore.getState().set({ cameraRequest: { position: [x, y - 2, 520], target: [x, y, 30], fov: 30 } }) }, { u: urls.store, x: (HOMER.x + GEORGIA.x) / 2, y: (HOMER.y + GEORGIA.y) / 2 })
  await page.waitForTimeout(4000)
  const homer = await screenAt(page, urls, HOMER.x, HOMER.y)
  const georgia = await screenAt(page, urls, GEORGIA.x, GEORGIA.y)
  const openMenu = async (at: { x: number; y: number }) => {
    await page.keyboard.press('Escape')
    // A note from the last action may sit near the spot: dismiss it, as a user would, so the click reaches the map.
    if (await toast(page).count()) await toast(page).getByRole('button', { name: 'Dismiss' }).click().catch(() => {})
    await expect(toast(page)).toHaveCount(0)
    await page.mouse.click(at.x, at.y)
    await expect(menu(page)).toBeVisible({ timeout: 60_000 })
    await expect(menu(page)).not.toContainText('Loading the City lots', { timeout: 30_000 })
  }

  // 4. Click the map: the menu names the building and the lot under the click.
  await openMenu(homer)
  await expect(menu(page)).toContainText(`Lot at ${HOMER.label}`)
  await expect(menu(page)).toContainText(/OSM building w\d+/)
  await page.screenshot({ path: join(SHOTS, '04-map-menu.png'), ...SHOT })

  // 4a. Replace this building (no site yet: its footprint becomes the site), then Undo from the note.
  await menu(page).getByRole('menuitem', { name: /Replace this building/ }).click()
  await expect(toast(page)).toContainText('shown as demolished')
  await expect(summary(page)).toContainText('1 existing building shown as demolished')
  await toast(page).getByRole('button', { name: 'Undo' }).click()
  await expect(summary(page)).toHaveCount(0)

  // 4b. Select several buildings to replace: one from the menu, one more by Shift-click, then Done.
  await openMenu(homer)
  await menu(page).getByRole('menuitem', { name: /Select several buildings/ }).click()
  const bar = page.getByTestId('site-multi-bar')
  await expect(bar).toContainText('1 building selected')
  await page.keyboard.down('Shift'); await page.mouse.click(georgia.x, georgia.y); await page.keyboard.up('Shift')
  await expect(bar).toContainText('2 buildings selected')
  await page.screenshot({ path: join(SHOTS, '05-select-several.png'), ...SHOT })
  await bar.getByRole('button', { name: /Done/ }).click()
  await expect(summary(page)).toContainText('2 existing buildings shown as demolished')
  await toast(page).getByRole('button', { name: 'Undo' }).click()
  await expect(summary(page)).toHaveCount(0)

  // 4c. Use this lot, then add the next lot: two lots combined along their shared lot line; the context changes.
  await openMenu(homer)
  await menu(page).getByRole('menuitem', { name: /Use this lot as the site/ }).click()
  await expect(summary(page)).toContainText('(1 City lot joined)')
  await openMenu(georgia)
  await expect(menu(page)).toContainText(`Lot at ${GEORGIA.label}`)
  await menu(page).getByRole('menuitem', { name: /Add this lot to the site/ }).click()
  await expect(toast(page)).toContainText(/Lot added: site [\d,]+ m² from 2 lots/)
  await expect(summary(page)).toContainText('(2 City lots joined)')
  await expect(summary(page)).toContainText(/\d+ existing buildings shown as demolished/)
  await expect(summary(page)).toContainText(`${HOMER.label}; ${GEORGIA.label}`)
  await page.waitForTimeout(2500)
  await page.screenshot({ path: join(SHOTS, '06-two-lots-combined.png'), ...SHOT })

  // 4d. Remove a lot again, and Undo brings the two-lot site back.
  await openMenu(georgia)
  await menu(page).getByRole('menuitem', { name: /Remove this lot from the site/ }).click()
  await expect(summary(page)).toContainText('(1 City lot joined)')
  await toast(page).getByRole('button', { name: 'Undo' }).click()
  await expect(summary(page)).toContainText('(2 City lots joined)')

  // 4e. Draw a box over lots: every lot it touches joins (one block).
  await openMenu(homer)
  await menu(page).getByRole('menuitem', { name: /Combine lots/ }).click()
  await expect(page.getByTestId('site-box-hint')).toBeVisible()
  await page.mouse.move(homer.x - 15, homer.y + 15)
  await page.mouse.down()
  for (let k = 1; k <= 6; k++) await page.mouse.move(homer.x - 15 + ((georgia.x - homer.x + 30) * k) / 6, homer.y + 15 + ((georgia.y - homer.y - 30) * k) / 6)
  await page.mouse.up()
  await expect(toast(page)).toContainText(/lots? selected by the box/, { timeout: 30_000 })
  await expect(summary(page)).toContainText(/City lots? joined/)
  await page.screenshot({ path: join(SHOTS, '07-box-over-lots.png'), ...SHOT })

  // 4f. Build the massing here: with no tower yet, the first tower is placed at the click, lined up with the lot, at
  // once (no Confirm since 6 Nov; Enter does nothing more).
  await openMenu(homer)
  await menu(page).getByRole('menuitem', { name: /Build the massing here/ }).click()
  await expect(toast(page)).toContainText('moved here')
  await page.waitForTimeout(1500)
  await page.screenshot({ path: join(SHOTS, '08-build-here-proposal.png'), ...SHOT })
  await page.keyboard.press('Enter')
  await page.waitForTimeout(2000)
  const tower1 = await page.evaluate(async (u) => { const { useStore } = await import(/* @vite-ignore */ u); const s = useStore.getState(); const t = s.towers.city[0]; return { x: t.x, y: t.y, n: s.towers.city.length } }, urls.store)
  expect(tower1.n).toBe(1)
  expect(Math.hypot(tower1.x - HOMER.x, tower1.y - HOMER.y)).toBeLessThan(45)

  // 5. On to Volume: the massing tools lead there, and the step bar lights Volume alone.
  await palette.getByRole('button', { name: /Next: Form/ }).click()
  await expect(rail.getByRole('button', { name: 'Form' })).toHaveAttribute('aria-current', 'step')
  await expect(rail.getByRole('button', { name: 'Site' })).not.toHaveAttribute('aria-current', 'step')
  await expect(page.locator('[data-tool]').first()).toHaveAttribute('data-tool', 'towers')
  // Past Site, the site and the Rhino import leave the panel (Ruijie, 6 Nov).
  await expect(page.locator('[role="tab"][data-tool="site"], [role="tab"][data-tool="rhino-import"]')).toHaveCount(0)
  await page.screenshot({ path: join(SHOTS, '09-volume-step.png'), ...SHOT })

  // 6. Context on (Ruijie, 3 Nov): Vista's textured render; the combined site is paved and the replaced buildings stay gone.
  const contextButton = page.getByRole('toolbar', { name: 'Map mode' }).getByRole('button', { name: /^Context/ })
  await contextButton.click()
  await expect(contextButton).toHaveAttribute('aria-pressed', 'true')
  await page.waitForTimeout(4000)
  await page.screenshot({ path: join(SHOTS, '10-context-on.png'), ...SHOT })
  await contextButton.click()
  await expect(contextButton).toHaveAttribute('aria-pressed', 'false')
})
