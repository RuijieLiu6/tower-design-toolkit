// A recorded walkthrough of adding your own design tool (Ruijie, 11 Nov 2026): Form Studio, served from the sibling
// read-only checkout with its toolkit-bridge.js, joins the Toolkit through Import › Add my tool, is placed in the Form
// workflow, is sent the selected tower after consent, proposes a taller tower, and Apply makes it the model. The same
// steps as e2e/design-tool.e2e.ts test 2, paced for a viewer, with a drawn cursor and a caption per step (both exist
// only in this recording's page). Not an assertion suite: the e2e test is.
// Run: node node_modules/playwright/cli.js test -c playwright.record.config.ts
import { expect, test, type Locator, type Page } from '@playwright/test'
import { createServer, type Server } from 'node:http'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { placeStartingTower } from '../helpers'

const here = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(here, '..', '..')
const OUT = join(ROOT, 'test-results')
const FORM_STUDIO_DEF = join(ROOT, 'public/tools/form-studio.tool.json')
const FS = resolve(ROOT, '..', 'form-studio-ro')
const FS_PORT = 5577
const FS_ORIGIN = `http://localhost:${FS_PORT}`
const FORM_STUDIO_ID = 'tool.form-studio'
const BASE_MODEL = resolve(ROOT, '..', '03 Vancouver Tall Competition Brief', 'SITE PLANS & 3D MODEL', 'Vancouver Tall Base Model.3dm')

// ------------------------------------------------------------------------------------ the served copy of Form Studio
let fsServer: Server | null = null
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.geojson': 'application/geo+json', '.txt': 'text/plain' }
const formStudioReady = () => existsSync(join(FS, 'index.html')) && existsSync(join(FS, 'toolkit-bridge.js'))
test.beforeAll(async () => {
  if (!formStudioReady()) return
  fsServer = createServer((req, res) => {
    const path = decodeURIComponent((req.url ?? '/').split('?')[0])
    const file = normalize(join(FS, path === '/' ? 'index.html' : path))
    if (!file.startsWith(FS) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end(); return }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
    res.end(readFileSync(file))
  })
  await new Promise<void>((ok) => fsServer!.listen(FS_PORT, '127.0.0.1', ok))
})
test.afterAll(() => { fsServer?.close() })

// ------------------------------------------------------------------------------------------- recording helpers
const OVERLAY = () => {
  if (window.top !== window) return
  const css = document.createElement('style')
  css.textContent = `
    #rec-cursor{position:fixed;left:0;top:0;width:22px;height:22px;z-index:2147483647;pointer-events:none;transform:translate(-3px,-2px);transition:left .45s cubic-bezier(.2,.7,.2,1),top .45s cubic-bezier(.2,.7,.2,1)}
    #rec-cursor svg{filter:drop-shadow(0 1px 2px rgba(0,0,0,.45))}
    #rec-ring{position:fixed;width:36px;height:36px;margin:-18px 0 0 -18px;border-radius:50%;border:3px solid #2563eb;opacity:0;z-index:2147483646;pointer-events:none}
    #rec-ring.go{animation:rec-ring .5s ease-out}
    @keyframes rec-ring{0%{opacity:.9;transform:scale(.4)}100%{opacity:0;transform:scale(1.4)}}
    #rec-cap{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);max-width:70vw;padding:10px 18px;border-radius:12px;background:rgba(17,24,39,.92);color:#fff;font:500 17px/1.35 Inter,system-ui,sans-serif;letter-spacing:-.01em;z-index:2147483645;pointer-events:none;box-shadow:0 6px 24px rgba(0,0,0,.25);opacity:0;transition:opacity .25s}
    #rec-cap.on{opacity:1}
    #rec-cap b{color:#93c5fd;font-weight:600;margin-right:8px}`
  const cur = document.createElement('div'); cur.id = 'rec-cursor'
  cur.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M5 3l14 8.5-6 1.5 3.5 6.5-2.5 1.3L10.5 14 6 18z" fill="#fff" stroke="#111827" stroke-width="1.6" stroke-linejoin="round"/></svg>'
  const ring = document.createElement('div'); ring.id = 'rec-ring'
  const cap = document.createElement('div'); cap.id = 'rec-cap'
  const mount = () => { document.head.append(css); document.documentElement.append(cur, ring, cap) }
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', mount) : mount()
  const w = window as unknown as Record<string, unknown>
  w.__recMove = (x: number, y: number) => { cur.style.left = `${x}px`; cur.style.top = `${y}px` }
  w.__recClick = (x: number, y: number) => { ring.style.left = `${x}px`; ring.style.top = `${y}px`; ring.classList.remove('go'); void ring.offsetWidth; ring.classList.add('go') }
  w.__recCaption = (step: string, text: string) => { cap.innerHTML = step ? `<b>${step}</b>${text}` : text; cap.classList.toggle('on', !!text) }
}

const pause = (p: Page, ms: number) => p.waitForTimeout(ms)
async function caption(p: Page, step: string, text: string, hold = 1_400) { await p.evaluate(([s, t]) => (window as unknown as { __recCaption: (s: string, t: string) => void }).__recCaption(s, t), [step, text]); await pause(p, hold) }
/** Moves the drawn cursor to the element, then clicks it with the real mouse (works inside the tool's frame too). */
async function tap(p: Page, target: Locator, settle = 700) {
  await target.waitFor({ timeout: 60_000 })
  await target.scrollIntoViewIfNeeded().catch(() => {})
  const box = await target.boundingBox()
  if (!box) throw new Error('no box for ' + target.toString())
  const x = box.x + box.width / 2, y = box.y + box.height / 2
  await p.evaluate(([x, y]) => (window as unknown as { __recMove: (x: number, y: number) => void }).__recMove(x, y), [x, y])
  await p.mouse.move(x, y, { steps: 12 })
  await pause(p, 450)
  await p.evaluate(([x, y]) => (window as unknown as { __recClick: (x: number, y: number) => void }).__recClick(x, y), [x, y])
  await p.mouse.click(x, y)
  await pause(p, settle)
}
async function typeInto(p: Page, field: Locator, value: string) {
  await tap(p, field, 200)
  await field.press('Control+a')
  await field.pressSequentially(value, { delay: 90 })
  await pause(p, 300)
  await field.press('Tab')
}

const rail = (p: Page) => p.getByRole('navigation', { name: 'Design process' })
const panel = (p: Page) => p.getByTestId('phase-panel')
const controls = (p: Page) => p.getByTestId('tool-controls')

// ------------------------------------------------------------------------------------------------------ the walk
test('add your own tool: Form Studio joins the Toolkit, proposes a taller tower, Apply', async ({ page: p }, info) => {
  test.skip(!formStudioReady(), 'needs the form-studio-ro checkout with toolkit-bridge.js beside this repo')
  test.setTimeout(600_000)
  const t0 = Date.now()
  await p.addInitScript(() => { try { localStorage.setItem('ts.landing.skip', '0'); localStorage.setItem('ts.onboarding.seen', '1') } catch { /* private mode */ } })
  await p.addInitScript(OVERLAY)
  await p.addLocatorHandler(p.getByRole('dialog').filter({ has: p.locator('#ob-title') }), async (d) => { await d.getByRole('button', { name: 'Start designing' }).click() })
  await p.goto('/#/guided')
  await rail(p).waitFor({ timeout: 120_000 })
  await p.getByRole('tab', { name: 'Competition site' }).or(p.getByRole('button', { name: 'Competition site' })).first().click({ timeout: 120_000 })
  // the competition context (Buildner's private base model, each entrant's own copy) so the scene is the real one
  if (existsSync(BASE_MODEL)) {
    const field = p.locator('input[type="file"][accept=".3dm"]').first()
    if (await field.count()) { await field.setInputFiles(BASE_MODEL); await p.locator('#vtc-card-title').waitFor({ state: 'detached', timeout: 180_000 }).catch(() => {}) }
  }
  await placeStartingTower(p, { stay: true })
  await panel(p).waitFor({ timeout: 60_000 })
  await pause(p, 2_500)
  const start = (Date.now() - t0) / 1000 // the video is trimmed to here: loading is not the experience

  // the definition file for the served copy (the committed one points at the same local origin until Pages carries the bridge)
  const def = JSON.parse(readFileSync(FORM_STUDIO_DEF, 'utf8')) as Record<string, unknown> & { connection: { url: string; origin: string } }
  let file = FORM_STUDIO_DEF
  if (def.connection.origin !== FS_ORIGIN) {
    const url = `${FS_ORIGIN}/index.html${new URL(def.connection.url).search}`
    mkdirSync(OUT, { recursive: true })
    file = join(OUT, 'record-form-studio.tool.json')
    writeFileSync(file, JSON.stringify({ ...def, connection: { ...def.connection, url, origin: FS_ORIGIN }, runtime: { browser: true, network: [FS_ORIGIN] }, destination: { ...(def.destination as object), to: FS_ORIGIN } }, null, 2))
  }

  await caption(p, '', 'Adding your own design tool to the Tower Design Toolkit', 2_200)

  // 1 · register through Import › Add my tool
  await caption(p, '1', 'Import › Add my tool: drop the tool\'s definition file', 600)
  await tap(p, p.getByTestId('transfer-import'))
  const dialog = p.getByTestId('transfer-dialog')
  await tap(p, dialog.getByTestId('purpose-tool'))
  await dialog.getByTestId('transfer-file').setInputFiles(file)
  const preview = dialog.getByTestId('transfer-preview')
  await expect(preview).toContainText('Form Studio', { timeout: 30_000 })
  await caption(p, '2', 'The preview says what the tool is, what it reads, what it may change, and where the data goes', 3_600)
  await tap(p, dialog.getByTestId('transfer-action'))
  if (await dialog.isVisible({ timeout: 2_000 }).catch(() => false)) { await p.keyboard.press('Escape'); await expect(dialog).toHaveCount(0) }

  // 3 · it is in My tools, state Connected; add it to the Form workflow
  await caption(p, '3', 'Edit workflow: the tool is in My tools, marked Connected', 600)
  await tap(p, p.getByTestId('edit-workflow-button'))
  const b = p.getByTestId('workflow-builder')
  await expect(b).toBeVisible({ timeout: 30_000 })
  const lib = b.getByTestId('tool-library')
  const entry = lib.getByTestId(`library-entry-${FORM_STUDIO_ID}`)
  if (!(await entry.isVisible({ timeout: 3_000 }).catch(() => false))) await typeInto(p, lib.getByTestId('library-search'), 'Form Studio')
  await entry.scrollIntoViewIfNeeded()
  await pause(p, 1_200)
  await caption(p, '4', 'Add it to the Form phase like any other node', 600)
  await tap(p, lib.getByTestId(`library-add-${FORM_STUDIO_ID}`))
  await tap(p, b.getByTestId('pending-add').getByTestId('add-confirm-yes'))
  await expect(b.getByTestId(`card-${FORM_STUDIO_ID}`)).toBeVisible({ timeout: 30_000 })
  await pause(p, 1_000)
  await tap(p, b.getByTestId('builder-apply'))
  await expect(b).toHaveCount(0, { timeout: 30_000 })

  // 5 · choose the tower, read the permission statement, agree
  const row = panel(p).locator(`[data-phase-node="${FORM_STUDIO_ID}"] [data-node]`).first()
  await caption(p, '5', 'Its row sits in the Form phase: choose the tower it may work on', 600)
  await tap(p, row)
  await expect(controls(p)).toBeVisible({ timeout: 30_000 })
  const targets = p.getByTestId('tool-targets')
  const options = await targets.locator('option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value).filter(Boolean))
  const box = await targets.boundingBox()
  if (box) await p.evaluate(([x, y]) => (window as unknown as { __recMove: (x: number, y: number) => void }).__recMove(x, y), [box.x + box.width / 2, box.y + box.height / 2])
  await targets.selectOption(options[0])
  await pause(p, 800)
  await caption(p, '6', 'Nothing has left the Toolkit yet: read what will be sent, then agree', 3_200)
  await tap(p, p.getByTestId('tool-consent'))
  const ws = p.getByTestId('tool-workspace')
  if (!(await ws.isVisible({ timeout: 1_500 }).catch(() => false))) await tap(p, p.getByTestId('tool-open'))
  await expect(ws).toBeVisible({ timeout: 30_000 })
  await expect(controls(p)).toHaveAttribute('data-state', 'waiting', { timeout: 60_000 })

  // 7 · work in Form Studio itself, in the centre view
  const fs = p.frameLocator('[data-testid="tool-frame"]')
  await expect(fs.getByText(/Connected to Tower Design Toolkit/)).toBeVisible({ timeout: 120_000 })
  await caption(p, '7', 'The tool opens in the centre with the selected tower loaded', 2_600)
  const details = fs.getByText('Precise dimensions').first()
  if (await details.isVisible({ timeout: 10_000 }).catch(() => false)) await tap(p, details)
  const height = fs.locator('#height')
  await expect(height).toBeVisible({ timeout: 30_000 })
  const seeded = Number(await height.inputValue())
  const target = Math.min(400, Math.round(seeded + 20))
  await caption(p, '8', `Design in the tool: height ${seeded} m → ${target} m`, 600)
  await typeInto(p, height, String(target))
  await pause(p, 1_200)
  await caption(p, '9', 'Send to Toolkit: the tool answers with a Design Change Proposal', 600)
  await tap(p, fs.getByRole('button', { name: /Send to Toolkit/ }))
  await expect(controls(p)).toHaveAttribute('data-state', 'returned', { timeout: 60_000 })

  // 10 · preview: Proposal tab and the ghost
  const tab = p.getByRole('tab', { name: 'Proposal' })
  await expect(tab).toBeVisible({ timeout: 30_000 })
  if ((await tab.getAttribute('aria-selected')) !== 'true') await tap(p, tab)
  await expect(p.getByTestId('proposal-summary')).toBeVisible({ timeout: 30_000 })
  await caption(p, '10', 'Proposal: changes, validation and impacts, with a ghost of the new tower. The model is untouched', 4_000)

  // 11 · Apply
  await caption(p, '11', 'Apply: one undoable change, with the tool recorded as its source', 600)
  await tap(p, p.getByTestId('proposal-apply'))
  await expect(controls(p)).toHaveAttribute('data-state', 'applied', { timeout: 30_000 })
  await pause(p, 1_200)
  await tap(p, p.getByTestId('tool-workspace-close'))
  await caption(p, '12', 'The tower now carries Form Studio\'s geometry. Ctrl+Z takes it back', 3_200)
  await caption(p, '', '', 400)
  const end = (Date.now() - t0) / 1000
  mkdirSync(OUT, { recursive: true })
  writeFileSync(join(OUT, 'record-add-my-tool.json'), JSON.stringify({ start, end, videoDir: info.outputDir }))
})
