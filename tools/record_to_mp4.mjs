// Turns the recorded walkthrough (test-results/<test>/video.webm + record-add-my-tool.json from the record config) into a
// trimmed H.264 mp4 that GitHub plays in the file viewer. Needs ffmpeg on PATH.
// Run: node tools/record_to_mp4.mjs [out.mp4]
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const OUT = join(ROOT, 'test-results')
const marks = JSON.parse(readFileSync(join(OUT, 'record-add-my-tool.json'), 'utf8'))
const dir = existsSync(marks.videoDir) ? marks.videoDir : OUT
const webm = readdirSync(dir).filter((f) => f.endsWith('.webm')).map((f) => join(dir, f)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0]
if (!webm) throw new Error('no .webm in ' + dir)
const out = process.argv[2] ?? join(ROOT, 'docs/media/add-my-tool.mp4')
const start = Math.max(0, marks.start - 0.5).toFixed(2)
execFileSync('ffmpeg', ['-y', '-ss', start, '-i', webm, '-vf', 'scale=1440:-2,fps=30', '-c:v', 'libx264', '-preset', 'slow', '-crf', '26', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', out], { stdio: 'inherit' })
console.log(`${out}: ${(statSync(out).size / 1e6).toFixed(1)} MB, trimmed ${start}s from ${webm}`)
