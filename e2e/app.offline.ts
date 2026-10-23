// The built app opens without a network after the first visit (backlog item 30): load once, cut the network (offline
// emulation, and every request that still reaches the network is refused), reload, and check the start page, the user
// guide and the guided app render. Also checks that the private competition model was never stored.
import { expect, test } from '@playwright/test'

test('opens offline after the first visit', async ({ page, context }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/#/start')
  const start = page.getByRole('heading', { name: /how do you want to design today/i })
  await expect(start).toBeVisible()
  // Active means the install step (downloading every precached file) finished.
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.ready).active?.state), { timeout: 30_000 }).toBe('activated')

  await context.setOffline(true)
  await context.route('**/*', (route) => route.abort('internetdisconnected'))
  await page.reload()
  await expect(start).toBeVisible()
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)

  await page.evaluate(() => { window.location.hash = '#/guide' })
  await expect(page.getByRole('heading', { name: 'User guide' })).toBeVisible()

  // The guided app, with the 3D view (three.js) and its data, all from the offline copy.
  await page.evaluate(() => { window.location.hash = '#/guided' })
  await expect(page.getByRole('tab', { name: 'Design' })).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('canvas').first()).toBeVisible()

  const cachedPrivate = await page.evaluate(async () => {
    for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) if (/\/(local|eval)\//.test(new URL(r.url).pathname)) return r.url
    return null
  })
  expect(cachedPrivate).toBeNull()
  expect(errors).toEqual([])
})
