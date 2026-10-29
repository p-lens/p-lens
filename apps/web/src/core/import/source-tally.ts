import type { IsoDate } from "../calendar/calendar"
import type { Decimal } from "../decimal/decimal"
import { describedBy, writableText, type Entry } from "../journal/entry"
import { toldTags } from "../tally/compose"
import { TALLY_TAGS, type InferredWorth, type TallyTold } from "../tally/tally"
import type { PlayGameKind, PlayId } from "../play/play"
import { sidePostings } from "../tally/sides"
import { inferredTheoreticalValuePosting } from "../theoretical/theoretical"

/**
 * A tally as another app kept it, read out of what that app wrote: the day,
 * where and on what as that app names them, what went in and what came
 * back in yen, and a note. Its names are the other app's, with the codes
 * that app knows them by — none of them yet a parlor of the parlor list or
 * a machine of the catalog.
 */
export interface SourceTally {
  readonly date: IsoDate
  readonly parlor: { readonly name: string; readonly code: string }
  readonly machine: { readonly name: string; readonly code: string; readonly maker: string }
  readonly cabinetNumber: string
  readonly outlay: Decimal
  readonly takings: Decimal
  readonly memo: string
  /** How long it lasted, in hours, where that app said. */
  readonly hours: Decimal | undefined
}

/** A machine of the catalog that a source's machine is, where its name is one's and only one game's. */
export interface MatchedMachine {
  readonly name: string
  readonly gameKind: PlayGameKind
}

/** A tally taken in from another app, ready to be written: the tally as that app kept it, where it came from, the id it goes by here, and the catalog's machine where its name matched one. */
export interface ImportedTally {
  readonly id: PlayId
  /** The app it came from, as a word of its own: `precord`. */
  readonly from: string
  readonly source: SourceTally
  readonly machine: MatchedMachine | undefined
  /** What it was taken to be worth from its hours and its two sides, where it was weighed. */
  readonly inferred: InferredWorth | undefined
}

/** What an imported tally tells of its play beside its two sides: its hours, where the other app said them, and what it was taken to be worth from them. */
const toldOf = (tally: ImportedTally): TallyTold | undefined =>
  tally.source.hours === undefined ? undefined : { hours: tally.source.hours, jackpots: undefined, inferred: tally.inferred }

/**
 * The tags an imported tally carries beside a tally's own, saying where it
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

/** A note as a comment under the entry can hold it: a colon would make a tag of the word before it. */
const noteOf = (memo: string): string => writableText(memo).replaceAll(":", "：")

const tagged = (name: string, value: string): readonly (readonly [string, string])[] => (writableText(value) === "" ? [] : [[name, writableText(value)]])

const cabinetOf = (source: SourceTally): string => [source.machine.name, source.cabinetNumber.trim() === "" ? "" : `${source.cabinetNumber.trim()}番台`].map(writableText).filter((part) => part !== "").join(" ")

/** An imported tally's description: the parlor as the other app named it for the payee, its machine and cabinet for the note. */
const describe = (source: SourceTally): string => describedBy(writableText(source.parlor.name), cabinetOf(source))

/**
 * An imported tally as one journal entry, in yen alone, its two sides as a
 * tally typed in by hand has them (`sidePostings`): a loss out of cash, a
 * gain into the special prizes, never into cash — with its hours where
 * the other app said them, and what it was taken to be worth from them
 * where it was weighed, as a tally typed in by hand has those too. Its
 * description is the tally as the other app named it; `machine` and
 * `game-kind` are written only where the catalog has the machine, and no
 * parlor is named until one is tied to it.
 */
export const importedTallyEntry = (tally: ImportedTally): Entry => ({
  date: tally.source.date,
  description: describe(tally.source),
  tags: [
    [TALLY_TAGS.playId, tally.id],
    ...(tally.machine === undefined ? [] : ([[TALLY_TAGS.gameKind, tally.machine.gameKind], [TALLY_TAGS.machine, tally.machine.name]] as const)),
    ...tagged(TALLY_TAGS.cabinetNumber, tally.source.cabinetNumber),
    [SOURCE_TAGS.from, tally.from],
    ...tagged(SOURCE_TAGS.parlor, tally.source.parlor.name),
    ...tagged(SOURCE_TAGS.parlorCode, tally.source.parlor.code),
    ...tagged(SOURCE_TAGS.machine, tally.source.machine.name),
    ...tagged(SOURCE_TAGS.machineCode, tally.source.machine.code),
    ...tagged(SOURCE_TAGS.maker, tally.source.machine.maker),
    ...toldTags(toldOf(tally)),
  ],
  postings: [...sidePostings(tally.source.outlay, tally.source.takings), ...(tally.inferred === undefined || tally.source.hours === undefined ? [] : [inferredTheoreticalValuePosting(tally.inferred.value)])],
  notes: noteOf(tally.source.memo) === "" ? [] : [noteOf(tally.source.memo)],
})

const FNV_OFFSET = 0x811c9dc5

const FNV_PRIME = 0x01000193

/** A text as eight hex digits that the same text always gives: FNV-1a, over its UTF-16 units. */
const digest = (text: string): string =>
  [...text]
    .reduce((hash, character) => Math.imul(hash ^ character.charCodeAt(0), FNV_PRIME) >>> 0, FNV_OFFSET)
    .toString(16)
    .padStart(8, "0")

const sameAs = (source: SourceTally): string =>
  [source.date, source.parlor.code, source.parlor.name, source.machine.code, source.machine.name, source.cabinetNumber, `${source.outlay.mantissa}e-${source.outlay.places}`, `${source.takings.mantissa}e-${source.takings.places}`, source.memo].join("\u001f")

/**
 * The ids a file's tallies go by here, in the file's order: where each came
 * from, its day, and a digest of everything it says — so the same file
 * taken in again gives the same ids, and what the book already has is left
 * alone. Two tallies that say exactly the same are told apart by their order,
 * each counted against those like it before it as the file is gone over once.
 */
export const importedIdsOf = (from: string, sources: readonly SourceTally[]): readonly PlayId[] =>
  sources.reduce<{ readonly ids: PlayId[]; readonly seen: Map<string, number> }>(
    (built, source) => {
      const key = sameAs(source)
      const earlier = built.seen.get(key) ?? 0
      built.seen.set(key, earlier + 1)
      built.ids.push(`${from}-${source.date.replaceAll("-", "")}-${digest(key)}${earlier === 0 ? "" : `-${earlier + 1}`}` as PlayId)
      return built
    },
    { ids: [], seen: new Map() },
  ).ids
