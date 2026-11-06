// "Send to Sun & Wind Studio" (6 Nov, Ruijie: "link the toolkit to sun & wind studio on the branch"): the Export menu
// opens Sinnie's Sun & Wind Studio, hands over the selected tower by postMessage, and her receiver (toolkit.js on the
// branch ruijie/tower-toolkit-link) imports it. Her branch is served here from the sibling checkout
// ../sun-wind-studio; the test is skipped when that checkout is missing. Her page loads three.js from cdnjs (network).
// Run: node node_modules/playwright/cli.js test e2e/sun-wind-link.e2e.ts
import { expect, test, type Page } from '@playwright/test'
import { createServer, type Server } from 'node:http'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { extname, join, normalize, resolve } from 'node:path'

const SW = resolve(process.cwd(), '..', 'sun-wind-studio')
const PORT = 5399
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.py': 'text/plain' }
let server: Server | null = null

test.skip(!existsSync(join(SW, 'toolkit.js')), 'needs the sun-wind-studio checkout on the branch ruijie/tower-toolkit-link beside this repo')
test.beforeAll(async () => {
  server = createServer((req, res) => {
    const path = decodeURIComponent((req.url ?? '/').split('?')[0])
    const file = normalize(join(SW, path === '/' ? 'index.html' : path))
    if (!file.startsWith(SW) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end(); return }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
    res.end(readFileSync(file))
  })
  await new Promise<void>((ok) => server!.listen(PORT, '127.0.0.1', ok))
})
test.afterAll(() => { server?.close() })

const store = (p: Page, fn: string) => p.evaluate(async (body) => {
  const url = performance.getEntriesByType('resource').map((e) => e.name).filter((x) => /\/src\/store\.ts/.test(x)).pop()!
  const { useStore } = await import(/* @vite-ignore */ url)
  return new Function('s', body)(useStore.getState())
}, fn)

test('Send to Sun & Wind Studio: the selected tower arrives in place, with its program; a second send updates it', async ({ page, context }) => {
  test.setTimeout(400_000)
  await page.addInitScript((port) => {
    performance.setResourceTimingBufferSize(10_000)
    try { localStorage.setItem('ts.landing.skip', '0'); localStorage.setItem('ts.onboarding.seen', '1'); localStorage.setItem('tdt.sunwind.url', `http://localhost:${port}/`) } catch { /* private mode */ }
  }, PORT)
  await page.addLocatorHandler(page.getByRole('dialog').filter({ has: page.locator('#ob-title') }), async (d) => { await d.getByRole('button', { name: 'Start designing' }).click() })
  // The demo has two towers on the competition block, whatever the app starts with.
  await page.goto('/#/start')
  await page.getByRole('button', { name: 'Open the demo project' }).click()
  await page.waitForURL(/#\/guided/)
  await page.waitForFunction(() => performance.getEntriesByType('resource').some((e) => /\/src\/store\.ts/.test(e.name)))
  await expect(page.locator('header')).toContainText('Demo', { timeout: 60_000 })
  const t = await store(page, `const t = s.towers.vtc.find((k) => k.id === s.selectedTower) ?? s.towers.vtc[0]; return { project: s.project, n: s.towers.vtc.length, x: t.x, y: t.y, name: t.name }`) as { project: string; n: number; x: number; y: number; name: string }
  expect(t.project).toBe('vtc')
  expect(t.n).toBe(2)

  await page.getByRole('button', { name: 'Export model' }).click()
  const [sw] = await Promise.all([context.waitForEvent('page'), page.getByTestId('sunwind-send').click()])
  await sw.waitForLoadState()
  expect(sw.url()).toContain('from=toolkit')
  await expect(sw.locator('#tdt-status')).toContainText('Imported', { timeout: 120_000 })
  await expect(sw.locator('#tdt-status')).toContainText('on the competition block')
  await expect(sw.locator('#tdt-status')).toContainText('North differs') // 45° in the Toolkit vs +y here: shown, not changed
  await expect(page.getByTestId('sunwind-status')).toContainText('Imported', { timeout: 30_000 })

  const got = await sw.evaluate(() => {
    const L = (window as unknown as { LAB: { upload: { top: number; levels: number[] | null } | null; floors: { prog: string }[]; S: { posX: number; posY: number; typology: string; overrides: Record<string, { prog?: string }> }; site: { meta: { source: string }; meshes: { fromLink?: boolean }[] } } }).LAB
    return { typology: L.S.typology, top: L.upload?.top ?? 0, floors: L.floors.length, posX: L.S.posX, posY: L.S.posY, site: L.site.meta.source, linked: L.site.meshes.filter((m) => m.fromLink).length,
      progs: [...new Set(L.floors.map((f) => f.prog))], set: Object.values(L.S.overrides).filter((o) => o.prog).length }
  })
  const storeys = await store(page, `const t = s.towers.vtc.find((k) => k.id === s.selectedTower) ?? s.towers.vtc[0]; return t.height`) as number
  expect(got.typology).toBe('upload')
  expect(got.site).toContain('Vancouver Tall Base Model') // her competition site, kept
  expect(Math.abs(got.top - storeys)).toBeLessThan(4.5) // whole storeys: the top one can stop under the nominal height
  // In place: her tower position is the Toolkit's (the shared competition frame), within the 1 m grid.
  expect(Math.abs(got.posX - t.x)).toBeLessThan(2)
  expect(Math.abs(got.posY - t.y)).toBeLessThan(2)
  expect(got.linked).toBeGreaterThan(0) // the other design tower, as context
  expect(got.set).toBe(got.floors) // the program on every floor
  console.log('Sun & Wind Studio got', JSON.stringify(got))

  // A design change, sent again to the same window (no reload).
  await store(page, `const t = s.towers.vtc.find((k) => k.id === s.selectedTower) ?? s.towers.vtc[0]; s.updateTower(t.id, { height: 250 })`)
  await page.bringToFront()
  if (!(await page.getByTestId('sunwind-send').isVisible())) await page.getByRole('button', { name: 'Export model' }).click()
  await page.getByTestId('sunwind-send').click()
  // Whole storeys: 250 m comes over as 249 m (the first send was 282.6 m).
  const top = () => sw.evaluate(() => (window as unknown as { LAB: { upload: { top: number } | null } }).LAB.upload?.top ?? 0)
  await expect.poll(top, { timeout: 60_000 }).toBeLessThanOrEqual(250)
  expect(await top()).toBeGreaterThan(245)
  await expect(page.getByTestId('sunwind-status')).toContainText('Imported')
})
