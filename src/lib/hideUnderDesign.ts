// Whether Real Vancouver hides the existing buildings under the design towers (lib/cityRemoval.ts). On by default since
// 3 Nov (Ruijie: "make the overlapped existing disappear so that there is not overlap of the existing building and the
// proposed building"); turning it off, "Show the existing buildings again", is remembered in this browser (localStorage
// `ts.hideUnderDesign`, wrapped: storage may be blocked). Hiding stays a hypothetical removal (team assumption).
// A light module: no three.js, so any component or test can read the switch.
import { create } from 'zustand'

export const HIDE_UNDER_DESIGN_KEY = 'ts.hideUnderDesign'
/** On unless this browser remembers the person turning it off. */
export const HIDE_UNDER_DESIGN_DEFAULT = true

type Read = Pick<Storage, 'getItem'>
type Write = Pick<Storage, 'setItem'>
const browserStorage = (): Storage | null => { try { return typeof localStorage === 'undefined' ? null : localStorage } catch { return null } }

/** The remembered choice: '1' on, '0' off; anything else (nothing stored, blocked storage) is the default. */
export function readHideUnderDesign(storage: Read | null = browserStorage()): boolean {
  try {
    const v = storage?.getItem(HIDE_UNDER_DESIGN_KEY)
    return v === '0' ? false : v === '1' ? true : HIDE_UNDER_DESIGN_DEFAULT
  } catch { return HIDE_UNDER_DESIGN_DEFAULT }
}

export function writeHideUnderDesign(on: boolean, storage: Write | null = browserStorage()): void {
  try { storage?.setItem(HIDE_UNDER_DESIGN_KEY, on ? '1' : '0') } catch { /* blocked storage: the choice lasts this session */ }
}

export const useHideUnderDesign = create<{ on: boolean }>(() => ({ on: readHideUnderDesign() }))
useHideUnderDesign.subscribe((s, prev) => { if (s.on !== prev.on) writeHideUnderDesign(s.on) })
