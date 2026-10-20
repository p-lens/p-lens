/** How many characters a result of six digits comes to, signed and grouped (`+360,000`): the length every shorter result is sized as. */
const COMMON_CHARACTERS = 8

/**
 * How a calendar's figures are sized: the largest they are written at
 * where a cell has room to spare, in rems, and how wide a character of a
 * result is taken to be, in ems: the figures are in the face for figures,
 * whose digits are each a little over half an em and whose commas are
 * narrower, so a digit's width with a little to spare.
 */
interface Room {
  readonly largestRems: number
  readonly characterEms: number
}

/** Several books' calendar: room to spare in every cell, since their days often run to a million. */
const BOOKS: Room = { largestRems: 0.75, characterEms: 0.64 }

/** One book's calendar: a little larger, `+999,999` fitting its cell with a hair to spare on an iPhone SE, whose bold digits ran a little over even at 0.60. */
const BOOK: Room = { largestRems: 0.875, characterEms: 0.62 }

const sizedIn =
  (room: Room) =>
  (text: string): string =>
    `min(${room.largestRems}rem, calc(100cqw / ${(Math.max(text.length, COMMON_CHARACTERS) * room.characterEms).toFixed(2)}))`

/**
 * The font size a text is written at to fit the width of what holds it,
 * as CSS: the largest size where it fits at that, and otherwise the size
 * at which so many characters come to the holder's width (`100cqw`, the
 * holder being a container). A result of six digits or fewer is sized as
 * one of six, so a month's cells read in one size of figures whatever
 * each made; only a longer one — `+1,360,000` — is in smaller figures,
 * and none is cut short. One book's figures are a little larger than
 * several books' together.
 */
export const fittedSize = sizedIn(BOOKS)

export const fittedSizeOfBook = sizedIn(BOOK)

/** Whose calendar it is: one book's, or several books' together. */
export type CalendarOf = "book" | "books"

export const FITTED_SIZE: Readonly<Record<CalendarOf, (text: string) => string>> = { book: fittedSizeOfBook, books: fittedSize }
