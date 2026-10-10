import { createSignal, onCleanup, type Accessor } from "solid-js"

/** How long a field stays red after something that needed it was pressed, in milliseconds. */
const RED_FOR = 2500

/** How long the page takes to glide to the topmost red field: quick, but slow enough to follow, in milliseconds. */
const GLIDE_FOR = 360

/** Room left above a red field the page glides to, in pixels: its label, and a little more, so it does not sit hard against the top. */
const GLIDE_MARGIN = 48

/** What every red field carries, so the page can find the topmost after a press. */
const NUDGED = "nudged"

const scrollsVertically = (element: HTMLElement): boolean => {
  const overflow = getComputedStyle(element).overflowY
  return (overflow === "auto" || overflow === "scroll") && element.scrollHeight > element.clientHeight
}

const scrollerOf = (element: HTMLElement): HTMLElement | undefined => {
  const parent = element.parentElement ?? undefined
  if (parent === undefined) return document.scrollingElement instanceof HTMLElement ? document.scrollingElement : undefined
  return scrollsVertically(parent) ? parent : scrollerOf(parent)
}

const easeOut = (progress: number): number => 1 - (1 - progress) ** 3

const glide = (scroller: HTMLElement, to: number): void => {
  const from = scroller.scrollTop
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    scroller.scrollTop = to
    return
  }
  const startedAt = performance.now()
  const step = (now: number): void => {
    const progress = Math.min(1, (now - startedAt) / GLIDE_FOR)
    scroller.scrollTop = from + (to - from) * easeOut(progress)
    if (progress < 1) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

const topmost = (elements: readonly HTMLElement[]): HTMLElement | undefined =>
  elements.reduce<HTMLElement | undefined>((best, element) => (best === undefined || element.getBoundingClientRect().top < best.getBoundingClientRect().top ? element : best), undefined)

/** Brings the topmost red field into view, if it is out of it: the field a press was waiting on, without hunting for it. */
const revealTopmost = (): void => {
  const field = topmost([...document.querySelectorAll<HTMLElement>(`.${NUDGED}`)])
  const scroller = field === undefined ? undefined : scrollerOf(field)
  if (field === undefined || scroller === undefined) return
  const view = scroller === document.scrollingElement ? { top: 0, bottom: window.innerHeight } : scroller.getBoundingClientRect()
  const box = field.getBoundingClientRect()
  if (box.top >= view.top + GLIDE_MARGIN && box.bottom <= view.bottom) return
  glide(scroller, scroller.scrollTop + box.top - view.top - GLIDE_MARGIN)
}

/** One reveal for all the nudges a single press makes, once they are drawn. */
const pendingReveal: { frame: number | undefined } = { frame: undefined }

const revealSoon = (): void => {
  if (pendingReveal.frame !== undefined) return
  pendingReveal.frame = requestAnimationFrame(() => {
    pendingReveal.frame = undefined
    revealTopmost()
  })
}

/**
 * A field saying "fill me in first", without a word: something that needs it
 * was pressed, so it turns red until it is focused or a moment has passed,
 * and then fades back; the page glides to the topmost red field if it is out
 * of view. P-Lens has no buttons that cannot be pressed; a press
 * that cannot go ahead nudges what it is waiting on instead.
 */
export interface Nudge {
  readonly red: Accessor<boolean>
  /** Turn the field red, starting the moment over if it already is. */
  readonly nudge: () => void
  /** The field has been attended to: let the red go now. */
  readonly settle: () => void
}

export const createNudge = (): Nudge => {
  const [red, setRed] = createSignal(false)
  const timer: { id: ReturnType<typeof setTimeout> | undefined } = { id: undefined }
  const settle = (): void => {
    if (timer.id !== undefined) clearTimeout(timer.id)
    timer.id = undefined
    setRed(false)
  }
  const nudge = (): void => {
    settle()
    setRed(true)
    timer.id = setTimeout(settle, RED_FOR)
    revealSoon()
  }
  onCleanup(settle)
  return { red, nudge, settle }
}

/**
 * The red ring of a field, for `classList`: on at once, so a press is answered
 * the moment it lands, and faded out slowly when it goes.
 */
export const redRing = (red: boolean): Readonly<Record<string, boolean>> => ({ [`${NUDGED} ring-2 ring-negative`]: red, "transition-shadow duration-700": !red })

/** The same for words that say what is wrong: warning-coloured, red at once when nudged, fading back. */
export const redText = (red: boolean): Readonly<Record<string, boolean>> => ({ [`${NUDGED} text-negative`]: red, "text-warning transition-colors duration-700": !red })
