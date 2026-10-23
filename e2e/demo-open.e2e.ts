// Regression (found 22 Oct while capturing the mid-review screens): with an autosave already in the browser,
// "Open the demo project" on the landing page opened the demo, then the guided app restored the autosave over it; and
// the step wasn't recorded, so Ctrl+Z couldn't bring the user's design back. Fixed in lib/tour.ts (loadDemo).
// Run: node node_modules/playwright/cli.js test e2e/demo-open.e2e.ts
import { expect, test, type Page } from '@playwright/test'

const heights = (p: Page) => p.evaluate(async () => {
  const url = performance.getEntriesByType('resource').map((e) => e.name).filter((x) => /\/src\/store\.ts/.test(x)).pop()!
  const { useStore } = await import(/* @vite-ignore */ url)
  return useStore.getState().towers.vtc.map((t: { height: number }) => t.height) as number[]
})

test('the demo opens over an existing autosave, and Undo brings the design back', async ({ page: p }) => {
  await p.addInitScript(() => { performance.setResourceTimingBufferSize(10_000); try { localStorage.setItem('ts.landing.skip', '0') } catch { /* ignore */ } })
  await p.goto('/#/guided')
  await p.waitForFunction(() => performance.getEntriesByType('resource').some((e) => /\/src\/store\.ts/.test(e.name)))
  await p.getByRole('button', { name: 'Start designing' }).click({ timeout: 8000 }).catch(() => {})
  await p.evaluate(async () => {
    const url = performance.getEntriesByType('resource').map((e) => e.name).filter((x) => /\/src\/store\.ts/.test(x)).pop()!
    const { useStore } = await import(/* @vite-ignore */ url)
    const s = useStore.getState(); s.updateTower(s.towers.vtc[0].id, { height: 266 })
  })
  await p.waitForTimeout(2500) // autosave (800 ms debounce)

  await p.goto('/#/start'); await p.reload()
  await p.getByRole('button', { name: 'Open the demo project' }).click()
  await p.waitForURL(/#\/guided/)
  await p.waitForTimeout(3000)
  await expect(p.locator('header')).toContainText('Demo')
  expect((await heights(p)).length).toBe(2)

  await p.getByRole('button', { name: 'Start designing' }).click({ timeout: 3000 }).catch(() => {})
  await p.getByRole('button', { name: 'Undo' }).click()
  await p.waitForTimeout(1000)
  expect(await heights(p)).toEqual([266])
})
