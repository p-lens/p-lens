import { createRoot, createSignal } from "solid-js"

/**
 * The one bubble open on screen, of every bubble that keeps to it:
 * opening one closes whichever was open, so that two never stand over each
 * other and each is closed the way it was opened.
 */
const shown = createRoot(() => {
  const [bubble, setBubble] = createSignal<symbol | undefined>(undefined)
  return { bubble, setBubble }
})

/** One bubble's open and its opening and closing, kept to the one open on screen: opened, it closes any other; closed, it leaves another that opened since as it is. */
export const createBubble = (): readonly [open: () => boolean, setOpen: (opened: boolean) => void] => {
  const self = Symbol("bubble")
  const open = (): boolean => shown.bubble() === self
  const setOpen = (opened: boolean): void => {
    if (opened) shown.setBubble(self)
    else if (open()) shown.setBubble(undefined)
  }
  return [open, setOpen]
}
