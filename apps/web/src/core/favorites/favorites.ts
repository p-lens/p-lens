import type { BookId, MemberId } from "../book/book"
import type { CatalogTarget } from "../catalog/catalog"
import type { BookFiles } from "../journal/layout"

/**
 * Where a book says which formulas and 設定配分 are kept handy in it, one
 * line of JSON a press of the heart — kept or let go — oldest first and
 * only ever added to, so what each of two devices added comes together as
 * lines do in a journal. Nothing else holds a book's favourites: what it
 * keeps now is these lines read through (`favoritesOf`), and any moment
 * before is the lines up to it. It is the book's own record of what was
 * done to its favourites, which is why the book's activity says nothing of
 * them. No journal includes it, so hledger passes it by, and it goes
 * wherever the book's files go — to a person's other devices, and into a
 * backup.
 */
export const FAVORITES_LOG = "logs/favorites.jsonl"

/** The version of a line's own shape, written on each line as the activity's is; a line of another version is passed over. */
const LINE_VERSION = 1

/** What a press did: kept the thing handy, or let it go. */
export type FavoriteDeed = "favorite-kept" | "favorite-let-go"

/**
 * One press of the heart in a book, shaped as a line of the book's
 * activity is: a line that can be pointed at by its id, when and by whom,
 * what was done as a word of its own, and what it was done to.
 */
export interface FavoriteLine {
  readonly id: string
  readonly at: string
  readonly by: MemberId
  readonly did: FavoriteDeed
  readonly target: CatalogTarget
}

const lineText = (line: FavoriteLine): string =>
  JSON.stringify({ v: LINE_VERSION, id: line.id, at: line.at, by: line.by, did: line.did, favorite: { target: line.target.type, id: line.target.id } })

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === "object" && value !== null && !Array.isArray(value)

const parsed = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

const targetOf = (value: unknown): CatalogTarget | undefined => {
  if (!isRecord(value)) return undefined
  const { target, id } = value
  return (target === "formula" || target === "distribution") && typeof id === "string" && id !== "" ? { type: target, id } : undefined
}

/** A line as it reads: a press, one a later version wrote in a shape or word this one does not know, or one that does not read at all. */
type LineRead = { readonly type: "press"; readonly line: FavoriteLine } | { readonly type: "later" } | { readonly type: "broken" }

/** A line read as a press; one a later version wrote says nothing this one can go by, and is passed over, but one that is no line of any version does not read. */
const lineOf = (text: string): LineRead => {
  const value = parsed(text)
  if (!isRecord(value) || typeof value["v"] !== "number") return { type: "broken" }
  if (value["v"] !== LINE_VERSION) return { type: "later" }
  const { id, at, by, did } = value
  const target = targetOf(value["favorite"])
  if (typeof id !== "string" || id === "" || typeof at !== "string" || Number.isNaN(Date.parse(at)) || typeof by !== "string" || target === undefined) return { type: "broken" }
  return did === "favorite-kept" || did === "favorite-let-go" ? { type: "press", line: { id, at, by: by as MemberId, did, target } } : { type: "later" }
}

const readLines = (text: string): readonly { readonly number: number; readonly read: LineRead }[] =>
  text.split("\n").flatMap((line, index) => (line.trim() === "" ? [] : [{ number: index + 1, read: lineOf(line) }]))

/** Every line of a favourites log that reads as a press, in the order written. */
const linesOf = (text: string): readonly FavoriteLine[] => readLines(text).flatMap(({ read }) => (read.type === "press" ? [read.line] : []))

/** The lines of a book's favourites log that do not read, by number: the presses they were are not counted, and the hearts may say otherwise than was pressed. */
export const unreadableFavoriteLines = (files: BookFiles): readonly number[] => readLines(files[FAVORITES_LOG] ?? "").flatMap(({ number, read }) => (read.type === "broken" ? [number] : []))

/**
 * What a book keeps handy, as the ids of its favourite formulas and
 * 設定配分: for each, what its latest press says — latest by when it was
 * pressed, not by where its line sits, since two devices' lines come
 * together in no order of time; of two pressed at the same moment, the
 * later line. A book with no favourites log keeps nothing.
 */
export const favoritesOf = (files: BookFiles): ReadonlySet<string> => {
  const latest = linesOf(files[FAVORITES_LOG] ?? "").reduce((sofar, line) => {
    const held = sofar.get(line.target.id)
    return held === undefined || Date.parse(line.at) >= Date.parse(held.at) ? new Map(sofar).set(line.target.id, line) : sofar
  }, new Map<string, FavoriteLine>())
  return new Set([...latest.values()].filter((line) => line.did === "favorite-kept").map((line) => line.target.id))
}

/** A book's files with one more press of the heart written in its favourites. */
export const withFavorite = (files: BookFiles, line: FavoriteLine): BookFiles => {
  const held = files[FAVORITES_LOG] ?? ""
  return { ...files, [FAVORITES_LOG]: `${held === "" || held.endsWith("\n") ? held : `${held}\n`}${lineText(line)}\n` }
}

/** What one book keeps as favourites. */
export interface KeptInBook {
  readonly bookId: BookId
  readonly kept: ReadonlySet<string>
}

const NONE_KEPT: ReadonlySet<string> = new Set()

/**
 * The favourites that choose among these formulas or 設定配分: those of the
 * first book, in the order given, that keeps any of them. The books after
 * it are not asked — a person's books are gone through from the top, and
 * the first to have a say has it. None where no book keeps one of them.
 */
export const keptAmong = (books: readonly KeptInBook[], ids: readonly string[]): ReadonlySet<string> =>
  books.find((book) => ids.some((id) => book.kept.has(id)))?.kept ?? NONE_KEPT
