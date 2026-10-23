// Node built-ins used by tests only (the app never imports Node modules): nodePackages.test.ts regenerates the skill's
// fixtures when UPDATE_SKILL_FIXTURES=1, data tests skip local-only files that aren't there (existsSync), and demo.test.ts writes public/demo (mkdirSync).
declare module 'node:fs' {
  export function writeFileSync(path: URL, data: string): void
  export function existsSync(path: URL): boolean
  export function mkdirSync(path: URL, options?: { recursive?: boolean }): void
}
