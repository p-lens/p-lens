import type { IsoDate } from "../calendar/calendar"
import { YEN } from "../commodity/commodity"
import { isZero, negate, subtract, type Decimal } from "../decimal/decimal"
import { ACCOUNTS } from "../journal/accounts"
import type { Entry, Posting } from "../journal/entry"
import { PLAY_TAGS, type PlayGameKind, type PlayId } from "../play/play"

/**
 * A play as another app kept it, read out of what that app wrote: the day,
 * where and on what as that app names them, what went in and what came
 * back in yen, and a note. Its names are the other app's, with the codes
 * that app knows them by — none of them yet a parlor of the parlor list or
 * a machine of the catalog.
 */
export interface SourcePlay {
  readonly date: IsoDate
  readonly parlor: { readonly name: string; readonly code: string }
  readonly machine: { readonly name: string; readonly code: string; readonly maker: string }
  readonly cabinetNumber: string
  readonly outlay: Decimal
  readonly takings: Decimal
  readonly memo: string
}

/** A machine of the catalog that a source's machine is, where its name is one's and only one game's. */
export interface MatchedMachine {
  readonly name: string
  readonly gameKind: PlayGameKind
}

/** A play taken in from another app, ready to be written: the play as that app kept it, where it came from, the id it goes by here, and the catalog's machine where its name matched one. */
export interface ImportedPlay {
  readonly id: PlayId
  /** The app it came from, as a word of its own: `precord`. */
  readonly from: string
  readonly source: SourcePlay
  readonly machine: MatchedMachine | undefined
}

/**
 * The tags an imported play carries beside a play's own, saying where it
 * came from and what that app called things. They are kept apart from
 * `parlor-id` and `machine`, which only ever hold the lists' own: a source's
 * name is written here as it was, with its code, so that it can be tied to
 * a listed parlor or a catalogued machine later, by the code, without
 * reading it back out of a description.
 */
export const SOURCE_TAGS = {
  from: "imported-from",
  parlor: "source-parlor",
  parlorCode: "source-parlor-code",
  machine: "source-machine",
  machineCode: "source-machine-code",
  maker: "source-maker",
} as const

/** A source's text as a tag value or a description can hold it: a comma would end a tag, a semicolon start a comment, a line break end the entry, so each gives way to its full-width twin or a space. */
const writable = (text: string): string => text.replaceAll(",", "，").replaceAll(";", "；").replace(/[\r\n]+/g, " ").trim()

/** A note as a comment under the entry can hold it: a colon would make a tag of the word before it. */
const noteOf = (memo: string): string => writable(memo).replaceAll(":", "：")

const tagged = (name: string, value: string): readonly (readonly [string, string])[] => (writable(value) === "" ? [] : [[name, writable(value)]])

const describe = (source: SourcePlay): string =>
  [source.parlor.name, source.machine.name, source.cabinetNumber.trim() === "" ? "" : `${source.cabinetNumber.trim()}番台`]
    .map(writable)
    .filter((part) => part !== "")
    .join(" ")

const real = (account: string, quantity: Decimal): readonly Posting[] => (isZero(quantity) ? [] : [{ account, amount: { quantity, commodity: YEN }, kind: "real" }])

/**
 * An imported play as one journal entry, in yen alone: what went in as the
 * play's expense, what came back as its revenue, and cash for what lies
 * between, so the two sides are kept and not only their difference. Its
 * description is the play as the other app named it; `machine` and
 * `game-kind` are written only where the catalog has the machine, and no
 * parlor is named until one is tied to it.
 */
export const importedPlayEntry = (play: ImportedPlay): Entry => ({
  date: play.source.date,
  description: describe(play.source),
  tags: [
    [PLAY_TAGS.playId, play.id],
    ...(play.machine === undefined ? [] : ([[PLAY_TAGS.gameKind, play.machine.gameKind], [PLAY_TAGS.machine, play.machine.name]] as const)),
    ...tagged(PLAY_TAGS.cabinetNumber, play.source.cabinetNumber),
    [SOURCE_TAGS.from, play.from],
    ...tagged(SOURCE_TAGS.parlor, play.source.parlor.name),
    ...tagged(SOURCE_TAGS.parlorCode, play.source.parlor.code),
    ...tagged(SOURCE_TAGS.machine, play.source.machine.name),
    ...tagged(SOURCE_TAGS.machineCode, play.source.machine.code),
    ...tagged(SOURCE_TAGS.maker, play.source.machine.maker),
  ],
  postings: [...real(ACCOUNTS.playExpense, play.source.outlay), ...real(ACCOUNTS.playRevenue, negate(play.source.takings)), ...real(ACCOUNTS.cash, subtract(play.source.takings, play.source.outlay))],
  notes: noteOf(play.source.memo) === "" ? [] : [noteOf(play.source.memo)],
})

const FNV_OFFSET = 0x811c9dc5

const FNV_PRIME = 0x01000193

/** A text as eight hex digits that the same text always gives: FNV-1a, over its UTF-16 units. */
const digest = (text: string): string =>
  [...text]
    .reduce((hash, character) => Math.imul(hash ^ character.charCodeAt(0), FNV_PRIME) >>> 0, FNV_OFFSET)
    .toString(16)
    .padStart(8, "0")

const sameAs = (source: SourcePlay): string =>
  [source.date, source.parlor.code, source.parlor.name, source.machine.code, source.machine.name, source.cabinetNumber, `${source.outlay.mantissa}e-${source.outlay.places}`, `${source.takings.mantissa}e-${source.takings.places}`, source.memo].join("\u001f")

/**
 * The ids a file's plays go by here, in the file's order: where each came
 * from, its day, and a digest of everything it says — so the same file
 * taken in again gives the same ids, and what the book already has is left
 * alone. Two plays that say exactly the same are told apart by their order.
 */
export const importedIdsOf = (from: string, sources: readonly SourcePlay[]): readonly PlayId[] => {
  const keys = sources.map(sameAs)
  return sources.map((source, index) => {
    const earlier = keys.slice(0, index).filter((key) => key === keys[index]).length
    return `${from}-${source.date.replaceAll("-", "")}-${digest(keys[index] ?? "")}${earlier === 0 ? "" : `-${earlier + 1}`}` as PlayId
  })
}
