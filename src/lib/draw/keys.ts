// Where a drawing tool's keys count (Ruijie, 17 Nov; review fix): on the model's canvas and the page body, and on the
// tool rail's tiles (a tile just clicked keeps the focus while the value is typed). Inside a dialog, a menu, a list or
// a text field they are the dialog's; on any other button or link, Enter and the rest are the button's, so Enter
// still presses it and Esc still closes what is open. Esc on a plain button ends the tool as it does anywhere.
type Closest = { closest: (selector: string) => unknown }
const IN_DIALOG = '[role="dialog"], [role="menu"], [role="listbox"], [role="tree"], input, textarea, select, [contenteditable="true"]'
const ON_RAIL = '[data-testid="tool-rail"]'
const ON_CONTROL = 'button, a, [role="menuitem"], [role="option"], [role="tab"]'

export function keyIsElsewhere(target: EventTarget | Closest | null, key: string, canvas?: unknown): boolean {
  const el = target as Closest | null
  if (!el || typeof el.closest !== 'function') return false
  if (el === canvas || (typeof document !== 'undefined' && el === document.body)) return false
  if (el.closest(IN_DIALOG)) return true
  if (el.closest(ON_RAIL)) return false
  if (key !== 'Escape' && el.closest(ON_CONTROL)) return true
  return false
}
