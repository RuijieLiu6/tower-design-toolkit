// How the app opens on another computer (Ruijie, 6 Nov: "now the competition site is missing on the other computer").
// 1. No base model (public/local answered 404, a fresh browser): the competition view still draws the brief's
//    144.8 x 79.2 m site and its streets, and the card offers "Add your copy of the base model".
// 2. No WebGL at all: a card says the 3D view couldn't start, and the rest of the app keeps working.
// Needs no competition files, so it runs anywhere. No screenshots.
// Run: node node_modules/playwright/cli.js test e2e/view-fallbacks.e2e.ts
import { expect, test, type Page } from '@playwright/test'

async function open(p: Page) {
  await p.route('**/local/vtc_context.json', (r) => r.fulfill({ status: 404, contentType: 'text/html', body: 'Not found' }))
  await p.addInitScript(() => { performance.setResourceTimingBufferSize(10_000); try { localStorage.setItem('ts.landing.skip', '0') } catch { /* ignore */ } })
  await p.addLocatorHandler(p.getByRole('dialog').filter({ has: p.locator('#ob-title') }), async (d) => { await d.getByRole('button', { name: 'Start designing' }).click() })
  await p.goto('/#/guided')
  await p.getByRole('tab', { name: 'Competition site' }).or(p.getByRole('button', { name: 'Competition site' })).first().click()
}

test('without the base model, the competition view draws the brief\'s site block and offers to add the model', async ({ page: p }) => {
  test.setTimeout(180_000)
  await open(p)
  const card = p.getByRole('region', { name: 'Competition context not loaded' })
  await expect(card).toBeVisible({ timeout: 60_000 })
  await expect(card).toContainText('144.8 × 79.2 m')
  await expect(card.getByRole('button', { name: 'Add your copy of the base model (.3dm)' })).toBeVisible()

  // The site surface (144.8 x 79.2 m) and the brief labels are in the scene.
  await p.waitForFunction(() => performance.getEntriesByType('resource').some((e) => /@react-three_fiber\.js/.test(e.name)))
  const fiber = await p.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name).filter((x) => /@react-three_fiber\.js/.test(x)).pop()!)
  await expect.poll(() => p.evaluate(async (url) => {
    const f = await import(/* @vite-ignore */ url)
    const canvas = document.querySelector('[data-viewport] canvas') as HTMLCanvasElement | null
    const root = canvas && f._roots.get(canvas)
    if (!root) return null
    const scene = root.store.getState().scene
    const site = scene.getObjectByName('vtc-site')
    const brief = scene.getObjectByName('vtc-brief-site')
    const g = site?.geometry?.parameters
    return { site: g ? [g.width, g.height] : null, labels: brief ? brief.children.length : 0 }
  }, fiber), { timeout: 60_000 }).toEqual({ site: [144.8, 79.2], labels: 4 })
})

test('without WebGL, a card says the 3D view couldn\'t start, and the panels still work', async ({ playwright, baseURL }) => {
  test.setTimeout(180_000)
  // Its own browser with WebGL switched off (the config's browser has SwiftShader WebGL).
  const browser = await playwright.chromium.launch({ args: ['--disable-webgl', '--disable-3d-apis'] })
  try {
    const p = await (await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 } })).newPage()
    const errors: string[] = []
    p.on('pageerror', (e) => errors.push(e.message))
    await open(p)
    const card = p.getByRole('alert').filter({ hasText: '3D view couldn\'t start' })
    await expect(card).toBeVisible({ timeout: 60_000 })
    await expect(card).toContainText('graphics (hardware) acceleration')
    // The rest of the app is still there: the right panel's site tab and the competition card.
    await expect(p.getByRole('tab', { name: 'Your site' }).or(p.getByRole('button', { name: 'Your site' })).first()).toBeVisible()
    await expect(p.getByRole('region', { name: 'Competition context not loaded' })).toBeVisible()
    expect(errors).toEqual([])
  } finally { await browser.close() }
})
