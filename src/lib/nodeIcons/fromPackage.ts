// A node package's optional icon (schema property `icon`), turned into an icon record the same way the editor makes one
// (Ruijie, 7 Nov: "Treat agent-generated images like any other user upload … An agent's claim of compliance is not
// proof"). A brief is drawn by the toolkit's generator; an image goes through the upload checks (content type, size,
// dimensions, renderability, then the quality checks), and a broken one leaves the node on the standard illustration.
import { CURRENT_STYLE, briefProblems, type IconBrief, type StyleVersion } from './brief'
import { DISPLAY, FIT, pixels, qualityChecks, readUpload, renderDisplay } from './image'
import { saveOriginal, useNodeIcons, type IconRecord, type Original } from './store'

export type PackageIcon =
  | { kind: 'brief'; brief: IconBrief }
  | { kind: 'image'; dataUrl: string; source?: 'agent' | 'upload'; styleVersion: StyleVersion }

/** Bytes of a base64 data URL (null when it isn't one). */
export function dataUrlBytes(url: string): { type: string; bytes: Uint8Array } | null {
  const m = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/]+={0,2})$/.exec(url)
  if (!m) return null
  try {
    const bin = atob(m[2])
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return { type: m[1], bytes }
  } catch { return null }
}

export interface PreparedIcon { record: IconRecord | null; original?: Original; problems: string[] }

export async function iconFromPackage(icon: PackageIcon, nodeName: string): Promise<PreparedIcon> {
  const at = new Date().toISOString()
  if (icon.kind === 'brief') {
    const problems = briefProblems(icon.brief)
    if (problems.length) return { record: null, problems }
    // The node's own name is the accessible name, whatever the brief says.
    return { record: { kind: 'generated', brief: { ...icon.brief, name: nodeName }, variant: 0, styleVersion: icon.brief.styleVersion, source: 'agent', updatedAt: at }, problems: [] }
  }
  const raw = dataUrlBytes(icon.dataUrl)
  if (!raw) return { record: null, problems: ['The icon image is not a readable base64 data URL.'] }
  const read = await readUpload(new Blob([raw.bytes as BlobPart]))
  if (!read.ok) return { record: null, problems: read.problems }
  const { upload } = read
  const cv = renderDisplay(upload.bitmap, upload.width, upload.height, FIT)
  const px = pixels(cv)
  const record: IconRecord = {
    kind: 'image', source: icon.source ?? 'agent', styleVersion: icon.styleVersion ?? CURRENT_STYLE, updatedAt: at,
    display: cv.toDataURL('image/png'), restyled: null, useRestyled: false, adjust: FIT, width: upload.width, height: upload.height, type: upload.type,
    checks: qualityChecks(px.rgba, DISPLAY, px.small),
  }
  const original: Original = { bytes: upload.bytes.buffer.slice(upload.bytes.byteOffset, upload.bytes.byteOffset + upload.bytes.byteLength) as ArrayBuffer, type: upload.type, name: `${nodeName}.${upload.type.split('/')[1]}`, savedAt: at }
  upload.bitmap.close?.()
  return { record, original, problems: [] }
}

/** Stores a package's icon for its node. A node that already has an icon keeps it unless `replace` (the user's choice
 *  wins over a package's). Returns what happened, in words, for the status line. */
export async function applyPackageIcon(nodeId: string, nodeName: string, icon: PackageIcon | undefined, replace = false): Promise<string | null> {
  if (!icon) return null
  const store = useNodeIcons.getState()
  if (store.icons[nodeId] && !replace) return 'Kept your icon for this node; the package’s icon was not used.'
  const prepared = await iconFromPackage(icon, nodeName)
  if (!prepared.record) return `The package’s icon could not be used (${prepared.problems.join(' ')}), so the node shows the standard illustration.`
  if (prepared.original) await saveOriginal(nodeId, prepared.original)
  store.setIcon(nodeId, prepared.record)
  return null
}
