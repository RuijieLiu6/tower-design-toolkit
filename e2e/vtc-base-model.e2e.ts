// Ruijie, 6 Nov: "when I open this website on a different computer the context doesn't show up"; 13 Nov: "users turn
// on the competition site directly instead of uploading, but keep the upload as an option". The derived context is
// included with the app (public/context/vtc/context.json), so the competition view opens with it and no card asks for
// a file. The dev server's public/local/vtc_context.json is answered with a 404, as on GitHub Pages. The entrant's own
// .3dm stays an option: added from the dock, read in the browser, kept in IndexedDB across a reload, and removed again,
// which goes back to the included context. Skips where the model is absent (CI). No screenshots of the context.
// Run: node node_modules/playwright/cli.js test e2e/vtc-base-model.e2e.ts
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'

const MODEL = fileURLToPath(new URL('../../03 Vancouver Tall Competition Brief/SITE PLANS & 3D MODEL/Vancouver Tall Base Model.3dm', import.meta.url))

/** The context store's state, read from the app's own module (dev server). */
const source = (p: Page) => p.evaluate(async () => {
  const url = performance.getEntriesByType('resource').map((e) => e.name).filter((x) => /\/src\/lib\/vtcContextSource\.ts/.test(x)).pop()!
  const { useVtcSource } = await import(/* @vite-ignore */ url)
  const s = useVtcSource.getState()
  return { status: s.status as string, source: s.source as string | null, buildings: (s.ctx?.buildings.length ?? 0) as number, future: (s.ctx?.future_towers.map((f: { z1: number | null }) => f.z1) ?? []) as (number | null)[] }
})

test.skip(!existsSync(MODEL), 'The competition base model is not on this computer')

test('the website reads the entrant\'s own copy of the base model and keeps it in this browser', async ({ page: p }) => {
  test.setTimeout(240_000)
  await p.route('**/local/vtc_context.json', (r) => r.fulfill({ status: 404, contentType: 'text/html', body: 'Not found' }))
  await p.addInitScript(() => { performance.setResourceTimingBufferSize(10_000); try { localStorage.setItem('ts.landing.skip', '0') } catch { /* ignore */ } })
  await p.addLocatorHandler(p.getByRole('dialog').filter({ has: p.locator('#ob-title') }), async (d) => { await d.getByRole('button', { name: 'Start designing' }).click() })
  await p.goto('/#/guided')
  await p.getByRole('tab', { name: 'Competition site' }).or(p.getByRole('button', { name: 'Competition site' })).first().click()

  // The included context loads by itself: no card, 99 buildings and the three future towers.
  const card = p.getByRole('region', { name: 'Competition context not loaded' })
  await p.waitForFunction(() => performance.getEntriesByType('resource').some((e) => /vtcContextSource\.ts/.test(e.name)))
  await expect.poll(async () => (await source(p)).status, { timeout: 60_000 }).toBe('ready')
  expect(await source(p)).toMatchObject({ source: 'included', buildings: 99 })
  await expect(card).toHaveCount(0)

  // Your own copy stays an option: the dock's section says the context is included and offers "Use your own copy instead".
  await p.getByTitle('Show the layers panel').click()
  const section = p.getByRole('button', { name: /^Competition context model/ })
  await expect(section).toContainText('included')
  if ((await section.getAttribute('aria-expanded')) !== 'true') await section.click()
  await expect(section).toHaveAttribute('aria-expanded', 'true')
  const useOwn = p.getByRole('button', { name: 'Use your own copy instead (.3dm)' })
  await expect(useOwn).toBeVisible()
  await expect(p.getByText(/Included with the app/)).toBeVisible()
  await useOwn.locator('xpath=ancestor::div[1]').locator('input[type=file]').setInputFiles(MODEL)
  await expect.poll(async () => (await source(p)).source, { timeout: 60_000 }).toBe('browser')
  const added = await source(p)
  expect(added).toMatchObject({ status: 'ready', source: 'browser', buildings: 99 })
  expect(added.future).toEqual([185.5, 243.84, 304.8])

  // A reload keeps it (IndexedDB), still with the dev file answered 404.
  await p.reload()
  await p.waitForFunction(() => performance.getEntriesByType('resource').some((e) => /vtcContextSource\.ts/.test(e.name)))
  await expect.poll(async () => (await source(p)).status, { timeout: 60_000 }).toBe('ready')
  expect(await source(p)).toMatchObject({ source: 'browser', buildings: 99 })
  await expect(card).toBeHidden()

  // Remove it from this browser: back to the included context, still no card.
  const show = p.getByTitle('Show the layers panel') // the panel stays open across the reload when it was open
  if (await show.isVisible().catch(() => false)) await show.click()
  await expect(section).toContainText('your copy')
  if ((await section.getAttribute('aria-expanded')) !== 'true') await section.click()
  await expect(section).toHaveAttribute('aria-expanded', 'true')
  const remove = p.getByRole('button', { name: 'Remove from this browser' })
  await remove.click()
  await expect(section).toContainText('included')
  await expect.poll(async () => (await source(p)).source, { timeout: 30_000 }).toBe('included')
  expect(await source(p)).toMatchObject({ status: 'ready', buildings: 99 })
  await expect(card).toHaveCount(0)
})
