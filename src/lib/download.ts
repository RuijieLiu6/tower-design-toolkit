// Hand the browser a file to save (project export, node packages, the skill). Nothing leaves the computer.
const TYPES: Record<string, string> = { md: 'text/markdown', json: 'application/json', jsonld: 'application/ld+json', mjs: 'text/javascript', zip: 'application/zip' }
export function saveFile(name: string, data: string | Uint8Array) {
  const type = TYPES[name.split('.').pop() ?? ''] ?? 'text/plain'
  const blob = new Blob([typeof data === 'string' ? data : new Uint8Array(data)], { type: type.startsWith('text/') ? `${type};charset=utf-8` : type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

