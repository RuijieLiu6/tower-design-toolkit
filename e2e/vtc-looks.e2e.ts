// The competition view's two looks (Ruijie, 6 Nov): Program (surrounding buildings in their ground-level use, with a
// legend) and Plain (a white, Rhino-like shaded model), remembered in this browser. Checked without the base model (as
// on another computer) and, where this computer has it, with the entrant's copy added. public/local is answered 404 so
// the model comes in the way a visitor adds it. No screenshots: competition content must never land in docs.
// Run: node node_modules/playwright/cli.js test e2e/vtc-looks.e2e.ts
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'

const MODEL = fileURLToPath(new URL('../../03 Vancouver Tall Competition Brief/SITE PLANS & 3D MODEL/Vancouver Tall Base Model.3dm', import.meta.url))

async function open(p: Page) {
  await p.route('**/local/vtc_context.json', (r) => r.fulfill({ status: 404, contentType: 'text/html', body: 'Not found' }))
  await p.addInitScript(() => { performance.setResourceTimingBufferSize(10_000); try { localStorage.setItem('ts.landing.skip', '0') } catch { /* ignore */ } })
  await p.addLocatorHandler(p.getByRole('dialog').filter({ has: p.locator('#ob-title') }), async (d) => { await d.getByRole('button', { name: 'Start designing' }).click() })
  await p.goto('/#/guided')
  await p.getByRole('tab', { name: 'Competition site' }).or(p.getByRole('button', { name: 'Competition site' })).first().click()
  await p.waitForFunction(() => performance.getEntriesByType('resource').some((e) => /@react-three_fiber\.js/.test(e.name)))
}

/** What the 3D scene holds: the look's groups, the use groups, the Plain lights and whether the sky is a gradient. */
const scene = (p: Page) => p.evaluate(async () => {
  const url = performance.getEntriesByType('resource').map((e) => e.name).filter((x) => /@react-three_fiber\.js/.test(x)).pop()!
  const f = await import(/* @vite-ignore */ url)
  const canvas = document.querySelector('[data-viewport] canvas') as HTMLCanvasElement | null
  const root = canvas && f._roots.get(canvas)
  if (!root) return null
  const s = root.store.getState().scene
  const names: string[] = []
  s.traverse((o: { name: string }) => { if (o.name) names.push(o.name) })
  return {
    program: names.includes('vtc-context-program'), plain: names.includes('vtc-context-plain'),
    uses: names.filter((n) => n.startsWith('vtc-use-')).map((n) => n.slice(8)).sort(),
    fill: names.includes('vtc-plain-fill'), gradient: !!s.background?.isTexture,
  }
})

const radio = (p: Page, name: string) => p.getByRole('radiogroup', { name: 'Competition view look' }).getByRole('radio', { name })

test('without the base model: both looks, the legend says what is missing, and the choice is remembered', async ({ page: p }) => {
  test.setTimeout(180_000)
  await open(p)
  const bar = p.getByTestId('vtc-look')
  await expect(radio(p, 'Program')).toHaveAttribute('aria-checked', 'true', { timeout: 60_000 })
  await expect(bar).toContainText('Add your copy of the base model to see the surrounding program')
  await radio(p, 'Plain').click()
  await expect(radio(p, 'Plain')).toHaveAttribute('aria-checked', 'true')
  await expect(bar).not.toContainText('Ground-level use', { ignoreCase: true })
  await expect.poll(() => scene(p), { timeout: 30_000 }).toMatchObject({ fill: true, gradient: true, program: false, plain: false })
  // Remembered in this browser.
  await p.reload()
  await p.getByRole('tab', { name: 'Competition site' }).or(p.getByRole('button', { name: 'Competition site' })).first().click()
  await expect(radio(p, 'Plain')).toHaveAttribute('aria-checked', 'true', { timeout: 60_000 })
})

test('with the entrant\'s copy: Program colours the buildings by use with a legend, Plain draws a white model', async ({ page: p }) => {
  test.skip(!existsSync(MODEL), 'The competition base model is not on this computer')
  test.setTimeout(240_000)
  await open(p)
  const card = p.getByRole('region', { name: 'Competition context not loaded' })
  await card.locator('input[type=file]').setInputFiles(MODEL)
  await expect(card).toBeHidden({ timeout: 60_000 })

  const bar = p.getByTestId('vtc-look')
  await expect(radio(p, 'Program')).toHaveAttribute('aria-checked', 'true')
  for (const label of ['Retail / commercial', 'Office', 'Hotel', 'Residential', 'Heritage', 'Proposed tower']) await expect(bar).toContainText(label)
  await expect.poll(() => scene(p), { timeout: 60_000 }).toMatchObject({ program: true, plain: false, fill: false })
  const uses = (await scene(p))!.uses
  for (const u of ['retail', 'office', 'hotel', 'residential', 'cultural', 'institutional']) expect(uses).toContain(u)

  await radio(p, 'Plain').click()
  await expect.poll(() => scene(p), { timeout: 30_000 }).toMatchObject({ program: false, plain: true, uses: [], fill: true, gradient: true })
})
