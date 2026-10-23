// The one Node built-in sandbox.test.ts uses: an independent SHA-256 to check the CSP hash (the app has no @types/node).
declare module 'node:crypto' {
  export function createHash(algorithm: 'sha256'): { update(data: string): { digest(encoding: 'base64'): string } }
}
