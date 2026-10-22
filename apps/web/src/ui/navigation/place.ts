import type { Focus } from "solid-gathering-shell"

import type { BookId } from "../../core/book/book"
import { isDocumentKind, type DocumentKind } from "../../core/document/document"
import type { PlayGameKind, PlayId } from "../../core/play/play"
import type { ConsolidatedBy } from "../../application/consolidation"
import { OVERALL, isBreakdownBy, isDimension, type BreakdownBy } from "../../core/report/breakdown"

const isConsolidatedBy = (text: string): text is ConsolidatedBy => text === OVERALL || text === "book" || text === "sender" || isDimension(text)

/** The screens a book has, each at its own address under the book. */
const BOOK_VIEWS = ["tallies", "holdings", "result-calendar", "activity", "files"] as const

export type BookView = (typeof BOOK_VIEWS)[number]

/** A book's views that keep nothing narrowed in their address. */
type WholeBookView = Exclude<BookView, "holdings" | "result-calendar">

const SETTINGS_SECTIONS = ["appearance", "business-day", "sync", "backup", "export", "import", "books", "sharing", "consolidation", "clear-data", "licenses"] as const

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]

/** The two ways a formula is made: figures typed in, or a basis simulated. */
const FORMULA_TABS = ["manual", "basis"] as const

export type FormulaTab = (typeof FORMULA_TABS)[number]

const isFormulaTab = (segment: string): segment is FormulaTab => (FORMULA_TABS as readonly string[]).includes(segment)

/**
 * Where the app is, read off the address and nothing else.
 *
 * Every move that changes the screen changes the address, so the browser's
 * back button — a phone's included — walks back through the same places in
 * reverse: a tally's detail, the list it was in, then the book's views.
 * `tally-new` adds a tally to a book by hand, by its totals in yen;
 * `tally-revise` sets a recorded tally right; `book-breakdown` groups a
 * book's results by what its last segment names; `book-file`
 * shows one of its files as it is kept, its path one encoded segment;
 * `passbook` shows one pool's savings day by day beside them all, the
 * pool named by its account, one encoded segment, and `parlor-passbook`
 * every pool of one parlor together, in yen.
 *
 * `book-view` is one of a book's views; its savings may be of some of its
 * parlors, and its calendar of some of those who played it, named by a
 * last segment as a consolidation's books are.
 *
 * `consolidated` is the space where several books are read as one, its
 * views listed as a book's are, each of every book on the device or of
 * those its last segment names, comma between them:
 * `consolidated-holdings` is their savings, `consolidated-result-calendar`
 * their results a month at a time, and `consolidated-breakdown` groups
 * their tallies together by what its segment names.
 *
 * The live space, at the top of the rail, holds plays still being played:
 * `live` lists them, `live-new` starts one of a game, `live-play` is one in progress and
 * `live-record` records it into its book, and `live-cabinet` says anew
 * which cabinet and machine it is on. `live-huddle-play` is one of the
 * others' plays in a huddle, by who they are in it and its id: only to be
 * looked at.
 *
 * `odd-prize-calculator` is the space where tokens are reckoned at a
 * counter, `odd-prize-calculator-game` the calculator of one game: what
 * so many tokens come to as special prizes and odd prizes. It keeps
 * nothing and writes nothing.
 *
 * `destination` is another person's book this device may only send plays
 * to, named by the inbox line they are put on: its side panel is the day's
 * plays and how each stands with it, and nothing of the book.
 *
 * A machine and its formulas are reached from starting a play, one depth to
 * an address so a back step climbs one level: `pachinko-machine-search` finds a
 * machine to play, by the search in its `q`; `parlor-submitted` is where
 * survey.p-lens.jp sends a person back with the parlor they submitted;
 * `pachinko-machine` lists its formulas, `pachinko-formula` is one 算出条件,
 * `pachinko-formula-grounds` its 計算根拠, `pachinko-formula-basis` its
 * 期待値基礎値. `pachinko-formula-new` makes one, by hand or by simulation.
 *
 * These are under `/pachinko`. Pachislot machines are under `/pachislot`, the
 * same depths in the same order — `pachislot-formula-basis` is a formula's 解析値 —
 * and `pachislot-distribution-new` registers a machine's 設定配分.
 */
export type Place =
  | { readonly kind: "live" }
  | { readonly kind: "live-new"; readonly game: PlayGameKind }
  | { readonly kind: "live-play"; readonly playId: PlayId }
  | { readonly kind: "live-record"; readonly playId: PlayId }
  | { readonly kind: "live-cabinet"; readonly playId: PlayId }
  | { readonly kind: "live-huddle-play"; readonly member: string; readonly playId: PlayId }
  | { readonly kind: "book"; readonly bookId: BookId }
  | { readonly kind: "book-view"; readonly bookId: BookId; readonly view: WholeBookView }
  /** A book's savings, of the parlors its last segment names where it names any. */
  | { readonly kind: "book-view"; readonly bookId: BookId; readonly view: "holdings"; readonly parlors?: readonly string[] | undefined }
  /** A book's calendar, of the tallies of those its last segment names among who played them where it names any. */
  | { readonly kind: "book-view"; readonly bookId: BookId; readonly view: "result-calendar"; readonly senders?: readonly string[] | undefined }
  | { readonly kind: "book-breakdown"; readonly bookId: BookId; readonly by: BreakdownBy }
  | { readonly kind: "tally"; readonly bookId: BookId; readonly playId: PlayId }
  | { readonly kind: "tally-new"; readonly bookId: BookId }
  | { readonly kind: "tally-revise"; readonly bookId: BookId; readonly playId: PlayId }
  | { readonly kind: "book-file"; readonly bookId: BookId; readonly path: string }
  /** One pool's passbook beside the book's savings, named by the pool's savings account. */
  | { readonly kind: "passbook"; readonly bookId: BookId; readonly account: string }
  /** A parlor's passbook beside the book's savings, every pool of it together in yen, named by the parlor. */
  | { readonly kind: "parlor-passbook"; readonly bookId: BookId; readonly parlorName: string }
  | { readonly kind: "pachinko-machine-search" }
  | { readonly kind: "parlor-submitted" }
  | { readonly kind: "pachinko-machine"; readonly machineId: string }
  | { readonly kind: "pachinko-formula"; readonly machineId: string; readonly formulaId: string }
  | { readonly kind: "pachinko-formula-grounds"; readonly machineId: string; readonly formulaId: string }
  | { readonly kind: "pachinko-formula-basis"; readonly machineId: string; readonly formulaId: string }
  | { readonly kind: "pachinko-formula-new"; readonly tab: FormulaTab }
  | { readonly kind: "pachislot-machine-search" }
  | { readonly kind: "pachislot-machine"; readonly machineId: string }
  | { readonly kind: "pachislot-formula"; readonly machineId: string; readonly formulaId: string }
  | { readonly kind: "pachislot-formula-grounds"; readonly machineId: string; readonly formulaId: string }
  | { readonly kind: "pachislot-formula-basis"; readonly machineId: string; readonly formulaId: string }
  | { readonly kind: "pachislot-formula-new"; readonly tab: FormulaTab }
  | { readonly kind: "pachislot-distribution-new"; readonly machineId: string }
  | { readonly kind: "destination"; readonly lineId: string }
  | { readonly kind: "odd-prize-calculator" }
  | { readonly kind: "odd-prize-calculator-game"; readonly game: PlayGameKind }
  | { readonly kind: "consolidated" }
  | { readonly kind: "consolidated-holdings"; readonly bookIds: readonly BookId[] | undefined }
  | { readonly kind: "consolidated-result-calendar"; readonly bookIds: readonly BookId[] | undefined }
  | { readonly kind: "consolidated-breakdown"; readonly by: ConsolidatedBy; readonly bookIds: readonly BookId[] | undefined }
  | { readonly kind: "settings" }
  | { readonly kind: "settings-section"; readonly section: SettingsSection }
  /** A document the deployment puts before people, at an address of its own so it can be pointed at from outside. */
  | { readonly kind: "document"; readonly document: DocumentKind }
  | { readonly kind: "not-found"; readonly path: string }

const isBookView = (segment: string): segment is BookView => (BOOK_VIEWS as readonly string[]).includes(segment)

const isSettingsSection = (segment: string): segment is SettingsSection =>
  (SETTINGS_SECTIONS as readonly string[]).includes(segment)

/** One path segment as it was meant, or undefined if it is not valid percent-encoding. */
const decodeSegment = (segment: string): string | undefined => {
  try {
    return decodeURIComponent(segment)
  } catch {
    return undefined
  }
}

/**
 * What a segment chooses, comma between them, each encoded on its own so
 * a comma in a name is no break; every one where there is no such
 * segment. A comma alone chooses none.
 */
const chosenIn = (segment: string | undefined): readonly string[] | undefined =>
  segment === undefined ? undefined : segment.split(",").filter((each) => each !== "").flatMap((each) => ((decoded) => (decoded === undefined ? [] : [decoded]))(decodeSegment(each)))

/** The books a segment names; every book on the device where there is no such segment. */
const bookIdsIn = (segment: string | undefined): readonly BookId[] | undefined => chosenIn(segment) as readonly BookId[] | undefined

/** A place under `/pachislot`, read from the segments after it. */
const pachislotPlaceOf = (segments: readonly string[], path: string): Place => {
  const [first, second, third, fourth, fifth, ...rest] = segments
  if (rest.length > 0) return { kind: "not-found", path }
  if (first === "machines" && second === undefined) return { kind: "pachislot-machine-search" }
  if (first === "machines" && second !== undefined && third === undefined) return { kind: "pachislot-machine", machineId: second }
  if (first === "machines" && second !== undefined && third === "distributions" && fourth === "new" && fifth === undefined)
    return { kind: "pachislot-distribution-new", machineId: second }
  if (first === "machines" && second !== undefined && third === "formulas" && fourth !== undefined) {
    if (fifth === undefined) return { kind: "pachislot-formula", machineId: second, formulaId: fourth }
    if (fifth === "grounds") return { kind: "pachislot-formula-grounds", machineId: second, formulaId: fourth }
    if (fifth === "basis") return { kind: "pachislot-formula-basis", machineId: second, formulaId: fourth }
  }
  if (first === "formulas" && second === "new" && third !== undefined && fourth === undefined && isFormulaTab(third))
    return { kind: "pachislot-formula-new", tab: third }
  return { kind: "not-found", path }
}

/** A place under `/pachinko`, read from the segments after it. */
const pachinkoPlaceOf = (segments: readonly string[], path: string): Place => {
  const [first, second, third, fourth, fifth, ...rest] = segments
  if (rest.length > 0) return { kind: "not-found", path }
  if (first === "machines" && second === undefined) return { kind: "pachinko-machine-search" }
  if (first === "machines" && second !== undefined && third === undefined) return { kind: "pachinko-machine", machineId: second }
  if (first === "machines" && second !== undefined && third === "formulas" && fourth !== undefined) {
    if (fifth === undefined) return { kind: "pachinko-formula", machineId: second, formulaId: fourth }
    if (fifth === "grounds") return { kind: "pachinko-formula-grounds", machineId: second, formulaId: fourth }
    if (fifth === "basis") return { kind: "pachinko-formula-basis", machineId: second, formulaId: fourth }
  }
  if (first === "formulas" && second === "new" && third !== undefined && fourth === undefined && isFormulaTab(third))
    return { kind: "pachinko-formula-new", tab: third }
  return { kind: "not-found", path }
}

const placeOfSegments = (segments: readonly string[], path: string): Place => {
  if (segments[0] === "pachinko") return pachinkoPlaceOf(segments.slice(1), path)
  if (segments[0] === "pachislot") return pachislotPlaceOf(segments.slice(1), path)
  const [first, second, third, fourth, fifth, ...rest] = segments
  if (rest.length > 0) return { kind: "not-found", path }
  if (first === "books" && second !== undefined && third === "tallies" && fourth !== undefined && fourth !== "new" && fifth === "revise")
    return { kind: "tally-revise", bookId: second as BookId, playId: fourth as PlayId }
  if (fifth !== undefined) return { kind: "not-found", path }
  if (first === "play" && second === undefined) return { kind: "live" }
  if (first === "play" && second === "huddle" && third !== undefined && fourth !== undefined) return { kind: "live-huddle-play", member: third, playId: fourth as PlayId }
  if (first === "play" && second === "new" && (third === "pachinko" || third === "pachislot") && fourth === undefined) return { kind: "live-new", game: third }
  if (first === "play" && second !== undefined && second !== "new" && third === undefined)
    return { kind: "live-play", playId: second as PlayId }
  if (first === "play" && second !== undefined && second !== "new" && third === "record" && fourth === undefined)
    return { kind: "live-record", playId: second as PlayId }
  if (first === "play" && second !== undefined && second !== "new" && third === "cabinet" && fourth === undefined)
    return { kind: "live-cabinet", playId: second as PlayId }
  if (first === "books" && second !== undefined && third === undefined) return { kind: "book", bookId: second as BookId }
  if (first === "books" && second !== undefined && third !== undefined && fourth === undefined && isBookView(third))
    return { kind: "book-view", bookId: second as BookId, view: third }
  if (first === "books" && second !== undefined && third === "holdings" && fourth !== undefined) return { kind: "book-view", bookId: second as BookId, view: "holdings", parlors: chosenIn(fourth) }
  if (first === "books" && second !== undefined && third === "result-calendar" && fourth !== undefined) return { kind: "book-view", bookId: second as BookId, view: "result-calendar", senders: chosenIn(fourth) }
  if (first === "books" && second !== undefined && third === "breakdown" && fifth === undefined && (fourth === undefined || isBreakdownBy(fourth)))
    return { kind: "book-breakdown", bookId: second as BookId, by: fourth ?? OVERALL }
  if (first === "books" && second !== undefined && third === "tallies" && fourth === "new") return { kind: "tally-new", bookId: second as BookId }
  if (first === "books" && second !== undefined && third === "files" && fourth !== undefined) return { kind: "book-file", bookId: second as BookId, path: fourth }
  if (first === "books" && second !== undefined && third === "passbooks" && fourth !== undefined) return { kind: "passbook", bookId: second as BookId, account: fourth }
  if (first === "books" && second !== undefined && third === "parlor-passbooks" && fourth !== undefined) return { kind: "parlor-passbook", bookId: second as BookId, parlorName: fourth }
  if (first === "books" && second !== undefined && third === "tallies" && fourth !== undefined)
    return { kind: "tally", bookId: second as BookId, playId: fourth as PlayId }
  if (first === "parlors" && second === "submitted" && third === undefined) return { kind: "parlor-submitted" }
  if (first === "destinations" && second !== undefined && third === undefined) return { kind: "destination", lineId: second }
  if (first === "odd-prize-calculator" && second === undefined) return { kind: "odd-prize-calculator" }
  if (first === "odd-prize-calculator" && (second === "pachinko" || second === "pachislot") && third === undefined) return { kind: "odd-prize-calculator-game", game: second }
  if (first === "consolidated" && second === undefined) return { kind: "consolidated" }
  if (first === "consolidated" && second === "holdings" && fourth === undefined) return { kind: "consolidated-holdings", bookIds: bookIdsIn(third) }
  if (first === "consolidated" && second === "result-calendar" && fourth === undefined) return { kind: "consolidated-result-calendar", bookIds: bookIdsIn(third) }
  if (first === "consolidated" && second === "breakdown" && fifth === undefined && (third === undefined || isConsolidatedBy(third)))
    return { kind: "consolidated-breakdown", by: third ?? OVERALL, bookIds: bookIdsIn(fourth) }
  if (first === "settings" && second === undefined) return { kind: "settings" }
  if (first === "settings" && second !== undefined && third === undefined && isSettingsSection(second))
    return { kind: "settings-section", section: second }
  if (first !== undefined && second === undefined && isDocumentKind(first)) return { kind: "document", document: first }
  return { kind: "not-found", path }
}

/** The place an address names; anything it does not name is not found. */
export const placeOf = (path: string): Place => {
  const segments = path.split("/").filter((segment) => segment !== "").map(decodeSegment)
  return segments.every((segment): segment is string => segment !== undefined)
    ? placeOfSegments(segments, path)
    : { kind: "not-found", path }
}

const encode = encodeURIComponent

/** The segment that names what a view is narrowed to, or none for every one; a comma alone for none at all. */
const chosenSegment = (chosen: readonly string[] | undefined): string => (chosen === undefined ? "" : `/${encode(chosen.length === 0 ? "," : chosen.map(encode).join(","))}`)

/** The segment that names what a book's view is narrowed to, if it is narrowed. */
const narrowedSegment = (place: Extract<Place, { kind: "book-view" }>): string => (place.view === "holdings" ? chosenSegment(place.parlors) : place.view === "result-calendar" ? chosenSegment(place.senders) : "")

export const pathOf = (place: Place): string => {
  switch (place.kind) {
    case "live":
      return "/play"
    case "live-new":
      return `/play/new/${place.game}`
    case "live-play":
      return `/play/${encode(place.playId)}`
    case "live-record":
      return `/play/${encode(place.playId)}/record`
    case "live-cabinet":
      return `/play/${encode(place.playId)}/cabinet`
    case "live-huddle-play":
      return `/play/huddle/${encode(place.member)}/${encode(place.playId)}`
    case "book":
      return `/books/${encode(place.bookId)}`
    case "book-view":
      return `/books/${encode(place.bookId)}/${place.view}${narrowedSegment(place)}`
    case "book-breakdown":
      return `/books/${encode(place.bookId)}/breakdown/${place.by}`
    case "tally":
      return `/books/${encode(place.bookId)}/tallies/${encode(place.playId)}`
    case "tally-new":
      return `/books/${encode(place.bookId)}/tallies/new`
    case "tally-revise":
      return `/books/${encode(place.bookId)}/tallies/${encode(place.playId)}/revise`
    case "book-file":
      return `/books/${encode(place.bookId)}/files/${encode(place.path)}`
    case "passbook":
      return `/books/${encode(place.bookId)}/passbooks/${encode(place.account)}`
    case "parlor-passbook":
      return `/books/${encode(place.bookId)}/parlor-passbooks/${encode(place.parlorName)}`
    case "pachinko-machine-search":
      return "/pachinko/machines"
    case "parlor-submitted":
      return "/parlors/submitted"
    case "pachinko-machine":
      return `/pachinko/machines/${encode(place.machineId)}`
    case "pachinko-formula":
      return `/pachinko/machines/${encode(place.machineId)}/formulas/${encode(place.formulaId)}`
    case "pachinko-formula-grounds":
      return `/pachinko/machines/${encode(place.machineId)}/formulas/${encode(place.formulaId)}/grounds`
    case "pachinko-formula-basis":
      return `/pachinko/machines/${encode(place.machineId)}/formulas/${encode(place.formulaId)}/basis`
    case "pachinko-formula-new":
      return `/pachinko/formulas/new/${place.tab}`
    case "pachislot-machine-search":
      return "/pachislot/machines"
    case "pachislot-machine":
      return `/pachislot/machines/${encode(place.machineId)}`
    case "pachislot-formula":
      return `/pachislot/machines/${encode(place.machineId)}/formulas/${encode(place.formulaId)}`
    case "pachislot-formula-grounds":
      return `/pachislot/machines/${encode(place.machineId)}/formulas/${encode(place.formulaId)}/grounds`
    case "pachislot-formula-basis":
      return `/pachislot/machines/${encode(place.machineId)}/formulas/${encode(place.formulaId)}/basis`
    case "pachislot-formula-new":
      return `/pachislot/formulas/new/${place.tab}`
    case "pachislot-distribution-new":
      return `/pachislot/machines/${encode(place.machineId)}/distributions/new`
    case "destination":
      return `/destinations/${encode(place.lineId)}`
    case "odd-prize-calculator":
      return "/odd-prize-calculator"
    case "odd-prize-calculator-game":
      return `/odd-prize-calculator/${place.game}`
    case "consolidated":
      return "/consolidated"
    case "consolidated-holdings":
      return `/consolidated/holdings${chosenSegment(place.bookIds)}`
    case "consolidated-result-calendar":
      return `/consolidated/result-calendar${chosenSegment(place.bookIds)}`
    case "consolidated-breakdown":
      return `/consolidated/breakdown/${place.by}${chosenSegment(place.bookIds)}`
    case "settings":
      return "/settings"
    case "settings-section":
      return `/settings/${place.section}`
    case "document":
      return `/${place.document}`
    case "not-found":
      return place.path
  }
}

/** Which pane a narrow window shows for a place. */
export const focusOf = (place: Place): Focus => {
  switch (place.kind) {
    case "live":
    case "book":
    case "destination":
    case "odd-prize-calculator":
    case "consolidated":
    case "settings":
      return "selection"
    case "tally":
    case "book-file":
    case "passbook":
    case "parlor-passbook":
      return "detail"
    case "live-new":
    case "live-play":
    case "live-record":
    case "live-cabinet":
    case "live-huddle-play":
    case "pachinko-machine-search":
    case "parlor-submitted":
    case "pachinko-machine":
    case "pachinko-formula":
    case "pachinko-formula-grounds":
    case "pachinko-formula-basis":
    case "pachinko-formula-new":
    case "pachislot-machine-search":
    case "pachislot-machine":
    case "pachislot-formula":
    case "pachislot-formula-grounds":
    case "pachislot-formula-basis":
    case "pachislot-formula-new":
    case "pachislot-distribution-new":
    case "book-view":
    case "book-breakdown":
    case "tally-new":
    case "tally-revise":
    case "consolidated-holdings":
    case "consolidated-result-calendar":
    case "consolidated-breakdown":
    case "odd-prize-calculator-game":
    case "settings-section":
    case "document":
    case "not-found":
      return "content"
  }
}

/**
 * The place one step back up from here: a tally's list, a view's book, a
 * section's settings, a consolidated view's list. The top of each space has
 * none.
 */
export const parentOf = (place: Place): Place | undefined => {
  switch (place.kind) {
    case "tally":
    case "tally-new":
      return { kind: "book-view", bookId: place.bookId, view: "tallies" }
    case "tally-revise":
      return { kind: "tally", bookId: place.bookId, playId: place.playId }
    case "book-file":
      return { kind: "book-view", bookId: place.bookId, view: "files" }
    case "passbook":
    case "parlor-passbook":
      return { kind: "book-view", bookId: place.bookId, view: "holdings" }
    case "book-view":
    case "book-breakdown":
      return { kind: "book", bookId: place.bookId }
    case "settings-section":
    case "document":
      return { kind: "settings" }
    case "live-new":
    case "live-play":
    case "live-huddle-play":
      return { kind: "live" }
    case "live-record":
    case "live-cabinet":
      return { kind: "live-play", playId: place.playId }
    case "pachinko-machine-search":
    case "parlor-submitted":
    case "pachinko-machine":
    case "pachinko-formula-new":
      return { kind: "live-new", game: "pachinko" }
    case "pachinko-formula":
      return { kind: "pachinko-machine", machineId: place.machineId }
    case "pachinko-formula-grounds":
      return { kind: "pachinko-formula", machineId: place.machineId, formulaId: place.formulaId }
    case "pachinko-formula-basis":
      return { kind: "pachinko-formula-grounds", machineId: place.machineId, formulaId: place.formulaId }
    case "pachislot-machine-search":
    case "pachislot-machine":
    case "pachislot-formula-new":
      return { kind: "live-new", game: "pachislot" }
    case "pachislot-formula":
    case "pachislot-distribution-new":
      return { kind: "pachislot-machine", machineId: place.machineId }
    case "pachislot-formula-grounds":
      return { kind: "pachislot-formula", machineId: place.machineId, formulaId: place.formulaId }
    case "pachislot-formula-basis":
      return { kind: "pachislot-formula-grounds", machineId: place.machineId, formulaId: place.formulaId }
    case "consolidated-holdings":
    case "consolidated-result-calendar":
    case "consolidated-breakdown":
      return { kind: "consolidated" }
    case "odd-prize-calculator-game":
      return { kind: "odd-prize-calculator" }
    case "live":
    case "book":
    case "destination":
    case "odd-prize-calculator":
    case "consolidated":
    case "settings":
    case "not-found":
      return undefined
  }
}

/** The book a place is inside, if it is inside one. */
export const bookOf = (place: Place): BookId | undefined =>
  place.kind === "book" || place.kind === "book-view" || place.kind === "book-breakdown" || place.kind === "tally" || place.kind === "tally-new" || place.kind === "tally-revise" || place.kind === "book-file" || place.kind === "passbook" || place.kind === "parlor-passbook" ? place.bookId : undefined

/**
 * Places under the live space at the top of the rail: plays in progress, and
 * everything about machines and formulas, which are reached from starting one.
 */
export const inLiveSpace = (place: Place): boolean =>
  [
    "live",
    "live-new",
    "live-play",
    "live-record",
    "live-cabinet",
    "live-huddle-play",
    "pachinko-machine-search",
    "parlor-submitted",
    "pachinko-machine",
    "pachinko-formula",
    "pachinko-formula-grounds",
    "pachinko-formula-basis",
    "pachinko-formula-new",
    "pachislot-machine-search",
    "pachislot-machine",
    "pachislot-formula",
    "pachislot-formula-grounds",
    "pachislot-formula-basis",
    "pachislot-formula-new",
    "pachislot-distribution-new",
  ].includes(place.kind)

/** Whether a place is in the space where several books are read as one. */
export const inConsolidation = (place: Place): boolean =>
  place.kind === "consolidated" || place.kind === "consolidated-holdings" || place.kind === "consolidated-result-calendar" || place.kind === "consolidated-breakdown"

/** The books a place of the consolidation is of: those its address names, or `undefined` for every book on the device — as it is anywhere else. */
export const consolidatedBooksOf = (place: Place): readonly BookId[] | undefined =>
  place.kind === "consolidated-holdings" || place.kind === "consolidated-result-calendar" || place.kind === "consolidated-breakdown" ? place.bookIds : undefined

/** Whether a place is in the space where tokens are reckoned at a counter. */
export const inOddPrizeCalculator = (place: Place): boolean => place.kind === "odd-prize-calculator" || place.kind === "odd-prize-calculator-game"

export const inSettings = (place: Place): boolean => place.kind === "settings" || place.kind === "settings-section" || place.kind === "document"

/** A place apart from what it is narrowed to: the books a consolidation reads, the parlors a book's savings show, who a book's calendar is of. */
const unnarrowed = (place: Place): Place => {
  switch (place.kind) {
    case "consolidated-holdings":
    case "consolidated-result-calendar":
    case "consolidated-breakdown":
      return { ...place, bookIds: undefined }
    case "book-view":
      return place.view === "holdings" ? { ...place, parlors: undefined } : place.view === "result-calendar" ? { ...place, senders: undefined } : place
    default:
      return place
  }
}

/**
 * The screen a place is drawn on: its address with nothing narrowed.
 * Narrowing a view changes its place and not its screen, so the view is
 * kept — the month it shows, a filter left open — and only told what it
 * is narrowed to now.
 */
export const screenOf = (place: Place): string => pathOf(unnarrowed(place))
