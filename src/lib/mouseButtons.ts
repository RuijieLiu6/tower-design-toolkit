// The 3D view's mouse: right-drag orbits, left-drag pans, the wheel zooms (17 Nov 2026, Sinnie: "right click hold and
// move around should be orbit"). Shared by the main view and the analysis view.
import * as THREE from 'three'

export const MOUSE_BUTTONS = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE } as const
