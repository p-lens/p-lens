/**
 * Lets go of whatever holds the focus, a phone's keyboard going with it:
 * a list being dragged is being read, not typed into, and the keyboard
 * only hides it. Bound to a drag — a touch that moves — and never to a
 * scroll, which a keyboard coming up causes itself.
 */
export const letGoOfFocus = (): void => {
  const held = document.activeElement
  if (held instanceof HTMLElement) held.blur()
}
