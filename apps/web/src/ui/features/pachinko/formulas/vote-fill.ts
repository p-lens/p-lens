import type { Mark, MyMarks } from "../../../../core/formula/standing"
import type { Paint } from "../../../primitives/icons"

/** A mark whose icon is painted; a favourite's heart is filled whole instead. */
type Filled = Exclude<Mark, "favorite">

/** What each mark's icon is painted in, inside and rim, where the mark is the person's own: each in its own colour. */
const PAINTS: Readonly<Record<Filled, Paint>> = {
  verification: { inside: "fill-verification", rim: "stroke-verification" },
  refutation: { inside: "fill-refutation", rim: "stroke-refutation" },
  adoption: { inside: "fill-adoption", rim: "stroke-adoption" },
  rejection: { inside: "fill-rejection", rim: "stroke-rejection" },
}

/** What is drawn inside the icon of a count whose mark is the person's own — a tick, a cross, the lines between fingers — the text's own colour, black on a light theme and white on a dark, whatever the count's tone. */
export const OWN_LINES = "text-text-primary"

/** Whether the person's own mark is among a count: their marks as the book keeps them, and whether the book keeps the formula as a favourite. */
export const isMine = (mark: Mark, mine: MyMarks, favorite: boolean): boolean => {
  switch (mark) {
    case "verification":
      return mine.verified
    case "refutation":
      return mine.refuted
    case "adoption":
      return mine.adopted
    case "rejection":
      return mine.rejected
    case "favorite":
      return favorite
  }
}

/** What a mark's icon is painted in: its colour where the mark is the person's own, nothing where it is not. */
export const paintOf = (mark: Filled, filled: boolean): Paint | undefined => (filled ? PAINTS[mark] : undefined)

/** What a count of marks set against each other is painted in: the first of them that is the person's own, nothing where none is. */
export const ownPaintOf = (marks: readonly Filled[], mine: MyMarks): Paint | undefined => {
  const own = marks.find((mark) => isMine(mark, mine, false))
  return own === undefined ? undefined : PAINTS[own]
}
