import { createSignal } from "solid-js"

/**
 * Whether the egg is open: one cell for the whole page, closed as the
 * page loads and kept nowhere, so that loading the page again closes it.
 */
const [open, setOpen] = createSignal(false)

export const isOpen = open

/** Open the egg where it is closed, close it where it is open: whether it is open after. */
export const turnOver = (): boolean => {
  const next = !open()
  setOpen(next)
  return next
}
