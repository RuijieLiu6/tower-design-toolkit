// Ruijie, 6 Nov: "when I open this website on a different computer the context doesn't show up". The competition context
// comes from Buildner's base model, which is never published, so the live site has no copy. Here the dev server's
// public/local/vtc_context.json is answered with a 404, as on GitHub Pages; the entrant adds their own .3dm, it is read
// in the browser, kept in IndexedDB across a reload, and removed again. Skips where the model is absent (CI). No
// screenshots: the competition content must never land in docs or reports.
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

  // Without the model: the card on the view says what is missing and how to add it.
  const card = p.getByRole('region', { name: 'Competition context not loaded' })
  await expect(card).toBeVisible({ timeout: 60_000 })
  await expect(card).toContainText('kept on this computer only')
  expect((await source(p)).status).toBe('missing')

  // Add the model: read here, the context appears, the card goes.
  await card.locator('input[type=file]').setInputFiles(MODEL)
  await expect(card).toBeHidden({ timeout: 60_000 })
  const added = await source(p)
  expect(added).toMatchObject({ status: 'ready', source: 'browser', buildings: 99 })
  expect(added.future).toEqual([185.5, 243.84, 304.8])

  // A reload keeps it (IndexedDB), still with the dev file answered 404.
  await p.reload()
  await p.waitForFunction(() => performance.getEntriesByType('resource').some((e) => /vtcContextSource\.ts/.test(e.name)))
  await expect.poll(async () => (await source(p)).status, { timeout: 60_000 }).toBe('ready')
  expect(await source(p)).toMatchObject({ source: 'browser', buildings: 99 })
  await expect(card).toBeHidden()

  // Remove it from this browser: the card is back.
  await p.getByTitle('Show the layers panel').click()
  const section = p.getByText('Competition context model', { exact: true })
  if (!(await p.getByRole('button', { name: 'Remove from this browser' }).isVisible())) await section.click()
  await p.getByRole('button', { name: 'Remove from this browser' }).click()
  await expect(card).toBeVisible()
  expect(await source(p)).toMatchObject({ status: 'missing', source: null, buildings: 0 })
})
