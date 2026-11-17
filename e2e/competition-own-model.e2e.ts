// Ruijie, 17 Nov: "when the tool opens, the competition model is shown by default, like the real map; users can also
// upload new model blocks: the competition page does not need a block bounding the model, it lets users upload any model
// of their own". The competition view opens with its context; the Site step's Context tile takes any model (an OBJ
// here, no block, no layer names) in place of it, with no block drawn; Back returns to the competition model. In the
// import dialog, a model with no tower can be used as the context. Needs no competition files. No screenshots.
// Run: node node_modules/playwright/cli.js test e2e/competition-own-model.e2e.ts
import { expect, test, type Page } from '@playwright/test'

/** Two boxes 60 m apart, in metres, Y up (the usual OBJ export): a context of my own, nowhere near the competition block. */
function obj(): string {
  const out: string[] = []
  const box = (x0: number, z0: number, w: number, d: number, h: number, n: number) => {
    out.push(`o Building${n}`)
    for (const [x, y, z] of [[0, 0, 0], [w, 0, 0], [w, 0, d], [0, 0, d], [0, h, 0], [w, h, 0], [w, h, d], [0, h, d]]) out.push(`v ${5000 + x0 + x} ${y} ${-(3000 + z0 + z)}`)
    const b = (n - 1) * 8
    for (const f of [[1, 2, 3, 4], [5, 8, 7, 6], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 8, 4], [4, 8, 5, 1]]) out.push(`f ${f.map((k) => k + b).join(' ')}`)
  }
  box(0, 0, 30, 20, 90, 1)
  box(60, 0, 25, 25, 40, 2)
  return out.join('\n') + '\n'
}
const FILE = { name: 'my-context.obj', mimeType: 'text/plain', buffer: Buffer.from(obj()) }

/** The context store and the scene's site, read from the app's own modules (dev server). */
const state = (p: Page) => p.evaluate(async () => {
  const names = performance.getEntriesByType('resource').map((e) => e.name)
  const { useVtcSource } = await import(/* @vite-ignore */ names.filter((x) => /\/src\/lib\/vtcContextSource\.ts/.test(x)).pop()!)
  const f = await import(/* @vite-ignore */ names.filter((x) => /@react-three_fiber\.js/.test(x)).pop()!)
  const canvas = document.querySelector('[data-viewport] canvas') as HTMLCanvasElement | null
  const root = canvas && f._roots.get(canvas)
  const s = useVtcSource.getState()
  return { status: s.status as string, source: s.source as string | null, own: s.own as string | null, buildings: (s.ctx?.buildings.length ?? 0) as number, site: !!root?.store.getState().scene.getObjectByName('vtc-site') }
})

test('the competition opens with its model, takes any model of your own as the context, and goes back', async ({ page: p }) => {
  test.setTimeout(240_000)
  await p.route('**/local/vtc_context.json', (r) => r.fulfill({ status: 404, contentType: 'text/html', body: 'Not found' }))
  await p.addInitScript(() => { performance.setResourceTimingBufferSize(10_000); try { localStorage.setItem('ts.landing.skip', '0'); localStorage.setItem('ts.onboarding.seen', '1') } catch { /* ignore */ } })
  await p.addLocatorHandler(p.getByRole('dialog').filter({ has: p.locator('#ob-title') }), async (d) => { await d.getByRole('button', { name: 'Start designing' }).click() })
  await p.goto('/#/guided')
  await p.getByRole('tab', { name: 'Competition site' }).or(p.getByRole('button', { name: 'Competition site' })).first().click()
  await p.waitForFunction(() => performance.getEntriesByType('resource').some((e) => /vtcContextSource\.ts/.test(e.name)) && performance.getEntriesByType('resource').some((e) => /@react-three_fiber\.js/.test(e.name)))

  // 1. Opens with the competition model: the included context and its block, no card asking for a file.
  await expect.poll(async () => (await state(p)).status, { timeout: 60_000 }).toBe('ready')
  await expect.poll(() => state(p), { timeout: 30_000 }).toMatchObject({ source: 'included', buildings: 99, site: true })
  await expect(p.getByRole('region', { name: 'Competition context not loaded' })).toHaveCount(0)
  const start = p.getByTestId('site-start')
  await expect(start).toContainText('The competition model is shown')
  await expect(p.getByTestId('vtc-site')).not.toContainText('fixed by the brief')

  // 2. Any model of your own as the context: an OBJ far from the block, with no block in it. No block is drawn.
  await start.getByTestId('vtc-context-file').setInputFiles(FILE)
  await expect.poll(() => state(p), { timeout: 60_000 }).toMatchObject({ source: 'browser', own: 'model', buildings: 2, site: false })
  await expect(start).toContainText('Your own context model is shown')
  await p.getByTitle('Show the layers panel').click()
  const section = p.getByRole('button', { name: /^Competition context model/ })
  await expect(section).toContainText('your model')
  if ((await section.getAttribute('aria-expanded')) !== 'true') await section.click()
  await p.getByTestId('vtc-own-notes').locator('summary').click()
  await expect(p.getByTestId('vtc-own-notes')).toContainText('Centred on the competition site')
  await expect(p.getByTestId('vtc-own-notes')).toContainText('no block is drawn')

  // 3. A reload keeps it (this browser's storage).
  await p.reload()
  await p.waitForFunction(() => performance.getEntriesByType('resource').some((e) => /vtcContextSource\.ts/.test(e.name)) && performance.getEntriesByType('resource').some((e) => /@react-three_fiber\.js/.test(e.name)))
  await expect.poll(() => state(p), { timeout: 60_000 }).toMatchObject({ source: 'browser', own: 'model', buildings: 2 })

  // 4. Back to the competition model, block and all.
  await p.getByTestId('site-start').getByRole('button', { name: 'Back to the competition model' }).click()
  await expect.poll(() => state(p), { timeout: 30_000 }).toMatchObject({ source: 'included', own: null, buildings: 99, site: true })

  // 5. The import dialog: a model with no tower mapped can be the context instead.
  await p.getByTestId('site-start').getByRole('button', { name: 'Upload a massing model' }).click()
  const dialog = p.getByRole('dialog', { name: 'Import a model' })
  await dialog.locator('input[type=file]').setInputFiles(FILE)
  const roles = dialog.getByRole('combobox', { name: /^Role for / })
  await expect(roles.first()).toBeVisible({ timeout: 30_000 })
  for (const sel of await roles.all()) await sel.selectOption('context')
  await expect(dialog.getByRole('button', { name: /Check units/ })).toBeDisabled()
  await dialog.getByTestId('import-as-context').click()
  await expect(dialog).toHaveCount(0)
  await expect.poll(() => state(p), { timeout: 30_000 }).toMatchObject({ source: 'browser', own: 'model', buildings: 2, site: false })
  await p.getByTestId('site-start').getByRole('button', { name: 'Back to the competition model' }).click()
  await expect.poll(() => state(p), { timeout: 30_000 }).toMatchObject({ source: 'included', buildings: 99 })
})
