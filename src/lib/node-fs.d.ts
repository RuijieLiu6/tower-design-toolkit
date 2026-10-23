// The one Node built-in the data tests use to read public/data (the app has no @types/node and never imports Node modules).
declare module 'node:fs' {
  export function readFileSync(path: URL): Uint8Array
  export function readFileSync(path: URL, encoding: 'utf8'): string
}
