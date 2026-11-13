import { createComponent, createContext, createRoot, createSignal, useContext, type JSX } from "solid-js"

/** A bubble and the bubbles it was opened inside, outermost first. */
type BubblePath = readonly symbol[]

/**
 * The one bubble open on screen, of every bubble that keeps to it, with the
 * bubbles it stands inside: opening one closes whichever was open but those
 * it stands inside, so that two never stand over each other side by side,
 * a bubble opened from inside another leaves that one open, and each is
 * closed the way it was opened.
 */
const shown = createRoot(() => {
  const [path, setPath] = createSignal<BubblePath>([])
  return { path, setPath }
})

/** The bubble whatever is drawn here stands inside, none at the top. */
const Enclosing = createContext<BubblePath>([])

const leadsTo = (whole: BubblePath, part: BubblePath): boolean => part.length <= whole.length && part.every((bubble, at) => whole[at] === bubble)

/**
 * One bubble's open and its opening and closing, kept to the one open on
 * screen: opened, it closes any other but those it stands inside; closed,
 * it closes those opened inside it too, and leaves another that opened
 * since as it is. What the bubble holds is drawn inside `Inside`, so that a
 * bubble opened from there stands inside this one.
 */
export const createBubble = (): readonly [open: () => boolean, setOpen: (opened: boolean) => void, Inside: (props: { readonly children: JSX.Element }) => JSX.Element] => {
  const self: BubblePath = [...useContext(Enclosing), Symbol("bubble")]
  const open = (): boolean => leadsTo(shown.path(), self)
  const setOpen = (opened: boolean): void => {
    if (opened) shown.setPath(self)
    else if (open()) shown.setPath(self.slice(0, -1))
  }
  const Inside = (props: { readonly children: JSX.Element }): JSX.Element =>
    createComponent(Enclosing.Provider, {
      value: self,
      get children() {
        return props.children
      },
    })
  return [open, setOpen, Inside]
}
