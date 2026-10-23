// The node-builder skill as the app hands it out: the paste-in prompt for the clipboard, the folder as a .zip, and
// single files. Bundled from skills/tower-studio-node-builder/ at build time, so the app always ships the same skill
// that is in the repository. Loaded only with the node builder dialog.
import { strToU8, zipSync } from 'fflate'

export const SKILL_NAME = 'tower-studio-node-builder'

const raw = import.meta.glob('../../skills/tower-studio-node-builder/**/*', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

const ORDER = ['SKILL.md', 'PROMPT.md', 'references/', 'scripts/']
export const SKILL_FILES: { path: string; text: string }[] = Object.entries(raw)
  .map(([k, text]) => ({ path: k.slice(k.indexOf(`${SKILL_NAME}/`) + SKILL_NAME.length + 1), text }))
  .sort((a, b) => {
    const rank = (p: string) => ORDER.findIndex((o) => (o.endsWith('/') ? p.startsWith(o) : p === o))
    return rank(a.path) - rank(b.path) || a.path.localeCompare(b.path)
  })

/** The paste-in prompt: PROMPT.md without its HTML comments, plus the library search the user started from. */
export function promptText(seed = ''): string {
  const md = SKILL_FILES.find((f) => f.path === 'PROMPT.md')?.text ?? ''
  const text = md.replace(/<!--[\s\S]*?-->\n?/g, '').replace(/\n{3,}/g, '\n\n').trim()
  return seed.trim() ? `${text}\n\nStarting point: the designer searched Tower Design Toolkit's node library for “${seed.trim()}” and found nothing. Begin from that.` : text
}

export function skillZip(): Uint8Array {
  return zipSync(Object.fromEntries(SKILL_FILES.map((f) => [`${SKILL_NAME}/${f.path}`, strToU8(f.text)])), { level: 6 })
}

export { saveFile } from './download'

export const sizeLabel = (text: string) => { const kb = new TextEncoder().encode(text).length / 1024; return kb < 1 ? '< 1 kB' : `${Math.round(kb)} kB` }
