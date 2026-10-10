import type { Focus } from "solid-gathering-shell"

import type { BookId } from "../../core/book/book"
import { isDocumentKind, type DocumentKind } from "../../core/document/document"
import type { PlayGameKind, PlayId } from "../../core/play/play"
import type { ConsolidatedBy } from "../../application/consolidation"
import { isDimension, type Dimension } from "../../core/report/breakdown"

const isConsolidatedBy = (text: string): text is ConsolidatedBy => text === "book" || isDimension(text)

/** The screens a book has, each at its own address under the book. */
const BOOK_VIEWS = ["plays", "holdings", "activity", "files"] as const

export type BookView = (typeof BOOK_VIEWS)[number]

const SETTINGS_SECTIONS = ["appearance", "business-day", "sync", "backup", "export", "import", "books", "consolidation", "licenses"] as const

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]

/** The two ways a formula is made: figures typed in, or a basis simulated. */
const FORMULA_TABS = ["manual", "basis", "simulator"] as const

export type FormulaTab = (typeof FORMULA_TABS)[number]

const isFormulaTab = (segment: string): segment is FormulaTab => (FORMULA_TABS as readonly string[]).includes(segment)

/**
 * Where the app is, read off the address and nothing else.
 *
 * Every move that changes the screen changes the address, so the browser's
 * back button — a phone's included — walks back through the same places in
 * reverse: a play's detail, the list it was in, then the book's views.
 * `play-new` adds a play to a book by hand, by its totals in yen;
 * `play-revise` sets a recorded play right; `book-breakdown` groups a
 * book's results by what its last segment names; `book-file`
 * shows one of its files as it is kept, its path one encoded segment.
 *
 * `consolidated` is the space where several books are read as one, its
 * views listed as a book's are; `consolidated-breakdown` groups their plays
 * together by what its segment names — every book on the device, or those
 * its last segment names, comma between them.
 *
 * The live space, at the top of the rail, holds plays still being played:
 * `live` lists them, `live-new` starts one of a game, `live-play` is one in progress and
 * `live-record` records it into its book.
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
  | { readonly kind: "book"; readonly bookId: BookId }
  | { readonly kind: "book-view"; readonly bookId: BookId; readonly view: BookView }
  | { readonly kind: "book-breakdown"; readonly bookId: BookId; readonly by: Dimension }
  | { readonly kind: "play"; readonly bookId: BookId; readonly playId: PlayId }
  | { readonly kind: "play-new"; readonly bookId: BookId }
  | { readonly kind: "play-revise"; readonly bookId: BookId; readonly playId: PlayId }
  | { readonly kind: "book-file"; readonly bookId: BookId; readonly path: string }
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
  | { readonly kind: "consolidated" }
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
  if (first === "books" && second !== undefined && third === "plays" && fourth !== undefined && fourth !== "new" && fifth === "revise")
    return { kind: "play-revise", bookId: second as BookId, playId: fourth as PlayId }
  if (fifth !== undefined) return { kind: "not-found", path }
  if (first === "play" && second === undefined) return { kind: "live" }
  if (first === "play" && second === "new" && (third === "pachinko" || third === "slot") && fourth === undefined) return { kind: "live-new", game: third }
  if (first === "play" && second !== undefined && second !== "new" && third === undefined)
    return { kind: "live-play", playId: second as PlayId }
  if (first === "play" && second !== undefined && second !== "new" && third === "record" && fourth === undefined)
    return { kind: "live-record", playId: second as PlayId }
  if (first === "books" && second !== undefined && third === undefined) return { kind: "book", bookId: second as BookId }
  if (first === "books" && second !== undefined && third !== undefined && fourth === undefined && isBookView(third))
    return { kind: "book-view", bookId: second as BookId, view: third }
  if (first === "books" && second !== undefined && third === "breakdown" && fifth === undefined && (fourth === undefined || isDimension(fourth)))
    return { kind: "book-breakdown", bookId: second as BookId, by: fourth === undefined ? "machine" : fourth }
  if (first === "books" && second !== undefined && third === "plays" && fourth === "new") return { kind: "play-new", bookId: second as BookId }
  if (first === "books" && second !== undefined && third === "files" && fourth !== undefined) return { kind: "book-file", bookId: second as BookId, path: fourth }
  if (first === "books" && second !== undefined && third === "plays" && fourth !== undefined)
    return { kind: "play", bookId: second as BookId, playId: fourth as PlayId }
  if (first === "parlors" && second === "submitted" && third === undefined) return { kind: "parlor-submitted" }
  if (first === "consolidated" && second === undefined) return { kind: "consolidated" }
  if (first === "consolidated" && second === "breakdown" && fifth === undefined && (third === undefined || isConsolidatedBy(third)))
    return { kind: "consolidated-breakdown", by: third === undefined ? "book" : third, bookIds: fourth === undefined ? undefined : (fourth.split(",").filter((id) => id !== "") as BookId[]) }
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
    case "book":
      return `/books/${encode(place.bookId)}`
    case "book-view":
      return `/books/${encode(place.bookId)}/${place.view}`
    case "book-breakdown":
      return `/books/${encode(place.bookId)}/breakdown/${place.by}`
    case "play":
      return `/books/${encode(place.bookId)}/plays/${encode(place.playId)}`
    case "play-new":
      return `/books/${encode(place.bookId)}/plays/new`
    case "play-revise":
      return `/books/${encode(place.bookId)}/plays/${encode(place.playId)}/revise`
    case "book-file":
      return `/books/${encode(place.bookId)}/files/${encode(place.path)}`
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
    case "consolidated":
      return "/consolidated"
    case "consolidated-breakdown":
      return place.bookIds === undefined ? `/consolidated/breakdown/${place.by}` : `/consolidated/breakdown/${place.by}/${encode(place.bookIds.join(","))}`
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
    case "consolidated":
    case "settings":
      return "selection"
    case "play":
    case "book-file":
      return "detail"
    case "live-new":
    case "live-play":
    case "live-record":
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
    case "play-new":
    case "play-revise":
    case "consolidated-breakdown":
    case "settings-section":
    case "document":
    case "not-found":
      return "content"
  }
}

/**
 * The place one step back up from here: a play's list, a view's book, a
 * section's settings, a consolidated view's list. The top of each space has
 * none.
 */
export const parentOf = (place: Place): Place | undefined => {
  switch (place.kind) {
    case "play":
    case "play-new":
      return { kind: "book-view", bookId: place.bookId, view: "plays" }
    case "play-revise":
      return { kind: "play", bookId: place.bookId, playId: place.playId }
    case "book-file":
      return { kind: "book-view", bookId: place.bookId, view: "files" }
    case "book-view":
    case "book-breakdown":
      return { kind: "book", bookId: place.bookId }
    case "settings-section":
    case "document":
      return { kind: "settings" }
    case "live-new":
    case "live-play":
      return { kind: "live" }
    case "live-record":
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
      return { kind: "live-new", game: "slot" }
    case "pachislot-formula":
    case "pachislot-distribution-new":
      return { kind: "pachislot-machine", machineId: place.machineId }
    case "pachislot-formula-grounds":
      return { kind: "pachislot-formula", machineId: place.machineId, formulaId: place.formulaId }
    case "pachislot-formula-basis":
      return { kind: "pachislot-formula-grounds", machineId: place.machineId, formulaId: place.formulaId }
    case "consolidated-breakdown":
      return { kind: "consolidated" }
    case "live":
    case "book":
    case "consolidated":
    case "settings":
    case "not-found":
      return undefined
  }
}

/** The book a place is inside, if it is inside one. */
export const bookOf = (place: Place): BookId | undefined =>
  place.kind === "book" || place.kind === "book-view" || place.kind === "book-breakdown" || place.kind === "play" || place.kind === "play-new" || place.kind === "play-revise" || place.kind === "book-file" ? place.bookId : undefined

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

export const inSettings = (place: Place): boolean => place.kind === "settings" || place.kind === "settings-section" || place.kind === "document"

