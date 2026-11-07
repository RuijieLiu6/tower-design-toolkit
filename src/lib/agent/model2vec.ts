// A small language model that runs in the visitor's browser, for the landing page's agent: minishlab/potion-base-8M
// (MIT; model2vec static embeddings distilled from BAAI/bge-base-en-v1.5). A sentence becomes the mean of its tokens'
// vectors, normalised; similar meanings land close together. No WebAssembly runtime and no server: the browser fetches
// the model once from huggingface.co (30 MB, then its own HTTP cache), and nothing the visitor types leaves the device.
// Pinned to one revision, so the matching never changes under us.
import { Tokenizer } from '@huggingface/tokenizers'

export const MODEL_ID = 'minishlab/potion-base-8M'
export const MODEL_REVISION = 'bf8b056651a2c21b8d2565580b8569da283cab23'
export const MODEL_BYTES = 30_236_760
const BASE = `https://huggingface.co/${MODEL_ID}/resolve/${MODEL_REVISION}/`

export interface Embedder {
  dim: number
  /** Unit vectors, one per text. */
  embed(texts: string[]): Float32Array[]
}

/** The embedding table from a safetensors file: its first (only) tensor, float32, rows = tokens. */
export function readSafetensors(buf: ArrayBuffer): { rows: number; dim: number; data: Float32Array } {
  const headerLen = Number(new DataView(buf).getBigUint64(0, true))
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, headerLen))) as Record<string, { dtype: string; shape: number[]; data_offsets: [number, number] }>
  const [name, t] = Object.entries(header).find(([k]) => k !== '__metadata__')!
  if (t.dtype !== 'F32' || t.shape.length !== 2) throw new Error(`${name}: expected a 2-D float32 tensor, found ${t.dtype} ${t.shape.join('×')}`)
  const start = 8 + headerLen + t.data_offsets[0], bytes = t.data_offsets[1] - t.data_offsets[0]
  // A typed array needs 4-byte alignment; copy if the header length leaves the data unaligned.
  const data = start % 4 === 0 ? new Float32Array(buf, start, bytes / 4) : new Float32Array(buf.slice(start, start + bytes))
  return { rows: t.shape[0], dim: t.shape[1], data }
}

/** Mean of the token rows, normalised (model2vec's StaticModel.encode with normalize = true). */
export function staticEmbedder(tokenize: (text: string) => number[], table: { rows: number; dim: number; data: Float32Array }): Embedder {
  const { dim, rows, data } = table
  return {
    dim,
    embed: (texts) => texts.map((text) => {
      const v = new Float32Array(dim)
      let n = 0
      for (const id of tokenize(text)) {
        if (id < 0 || id >= rows) continue
        const o = id * dim
        for (let k = 0; k < dim; k++) v[k] += data[o + k]
        n++
      }
      let norm = 0
      for (let k = 0; k < dim; k++) norm += v[k] * v[k]
      norm = Math.sqrt(norm) || 1
      for (let k = 0; k < dim; k++) v[k] /= norm
      return v
    }),
  }
}

async function fetchWithProgress(url: string, total: number, onProgress?: (done: number, total: number) => void): Promise<ArrayBuffer> {
  const r = await fetch(url)
  if (!r.ok || !r.body) throw new Error(`${url.split('/').pop()}: HTTP ${r.status}`)
  const size = Number(r.headers.get('content-length')) || total
  const reader = r.body.getReader(), parts: Uint8Array[] = []
  let done = 0
  for (;;) {
    const { value, done: end } = await reader.read()
    if (end) break
    parts.push(value)
    done += value.byteLength
    onProgress?.(done, size)
  }
  const out = new Uint8Array(done)
  let at = 0
  for (const p of parts) { out.set(p, at); at += p.byteLength }
  return out.buffer
}

let loading: Promise<Embedder> | null = null

/** Loads the model once per page (later calls share the same promise). */
export function loadEmbedder(onProgress?: (done: number, total: number) => void): Promise<Embedder> {
  loading ??= (async () => {
    const [tokJson, tokConfig, weights] = await Promise.all([
      fetch(BASE + 'tokenizer.json').then((r) => { if (!r.ok) throw new Error(`tokenizer.json: HTTP ${r.status}`); return r.json() }),
      fetch(BASE + 'tokenizer_config.json').then((r) => (r.ok ? r.json() : {})),
      fetchWithProgress(BASE + 'model.safetensors', MODEL_BYTES, onProgress),
    ])
    const tok = new Tokenizer(tokJson, tokConfig)
    return staticEmbedder((t) => tok.encode(t, { add_special_tokens: false }).ids, readSafetensors(weights))
  })()
  loading.catch(() => { loading = null })
  return loading
}
