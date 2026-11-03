// Editor-only helpers in the 3D view (the tower gizmo and the selection outline) belong to the live view, never to a
// capture or a board. components/TowerGizmo.tsx shows them only on the frame loop's own render and registers a clean
// re-render here; lib/capture.ts calls it before reading the canvas. No three.js import, so the main bundle stays small.

let cleanRender: (() => void) | null = null

export function setCleanRender(fn: (() => void) | null) { cleanRender = fn }

/** Re-draw the 3D canvas without the editor helpers (they come back on the next frame). No-op when no view is mounted. */
export function renderCleanFrame() { cleanRender?.() }
