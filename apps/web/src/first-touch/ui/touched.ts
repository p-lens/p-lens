import { placeOf } from "../../ui/navigation/place"
import type { Screen, Tokens, Touch } from "../core/notes"

/** What may be touched for a note: a field, a button, or a list's trigger. */
const TOUCHABLE = "input, textarea, button, [role='button']"

const screenOf = (path: string): Screen => {
  const place = placeOf(path)
  switch (place.kind) {
    case "live-new":
      return "live-start"
    case "live-play":
      return "live-play"
    case "live-record":
      return "live-record"
    case "tally-new":
    case "tally-revise":
      return "tally"
    default:
      return "elsewhere"
  }
}

/** The text of the elements an `aria-labelledby` names, one after another. */
const labelledText = (ids: string): string =>
  ids
    .split(/\s+/)
    .map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
    .filter((text) => text !== "")
    .join(" ")

/** The name a thing goes by for a screen reader: its own label, or the text of what labels it. */
const nameOf = (element: Element): string => element.getAttribute("aria-label")?.trim() || labelledText(element.getAttribute("aria-labelledby") ?? "")

/** Whether a field, or a list's trigger, stands in a group with its label: the note then points at the two together. */
const labelled = (element: Element): boolean => element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element.getAttribute("aria-haspopup") === "listbox"

/** The field's group, with its label, where it stands in one. */
const groupOf = (element: Element): Element | undefined => (labelled(element) ? (element.closest("[role='group']") ?? undefined) : undefined)

/** The tokens a field counts, by the unit written after it: 玉, or 枚 for medals. */
const tokensOf = (element: Element): Tokens | undefined => {
  if (!labelled(element)) return undefined
  const unit = element.parentElement?.textContent ?? ""
  return unit.includes("枚") ? "medals" : unit.includes("玉") ? "balls" : undefined
}

/** Whether the play being recorded is at no parlor: its form offers to carry the tokens off the book (簿外). */
const offBookAround = (element: Element): boolean => (element.closest("form") ?? element.closest("main") ?? document.body).textContent?.includes("簿外") ?? false

/**
 * What was touched and where to point at it, or nothing where it is
 * nothing a note could be about. It reads the screens from outside, by
 * what they already are — the address, the names fields and buttons go
 * by for a screen reader, the words around them — and the screens know
 * nothing of it: a screen changed so that it no longer reads as it did
 * is a note no longer shown, and nothing worse.
 */
export const touchOf = (target: EventTarget | null, path: string): { readonly touch: Touch; readonly anchor: Element } | undefined => {
  const element = target instanceof Element ? (target.closest(TOUCHABLE) ?? undefined) : undefined
  if (element === undefined) return undefined
  const name = nameOf(element)
  if (name === "") return undefined
  return {
    touch: { screen: screenOf(path), name, tokens: tokensOf(element), offBook: offBookAround(element) },
    anchor: groupOf(element) ?? element,
  }
}
