import type { MemberId } from "../book/book"
import { parseIsoDate, type IsoDate } from "../calendar/calendar"
import type { TokenKind } from "../commodity/commodity"
import type { ChangeIntent, JournalChange } from "../change/journal-change"
import { isFilePatch, type FilePatch } from "../change/patch"
import { parseDecimal, toPlainString, type Decimal } from "../decimal/decimal"
import type { BookFiles } from "../journal/layout"
import type { PlayId } from "../play/play"

/**
 * Where a book says what was done to it, one line of JSON a thing done,
 * oldest first and only ever added to — so what each of two devices added
 * comes together as lines do in a journal. A line holds what its change
 * did to each file, so the lines made in order from nothing leave the
 * book's journals and play logs as they stand, and the lines up to any
 * one leave them as they stood then. It is one of the book's files: no
 * journal includes it, so hledger passes it by, and it goes wherever the
 * book's files go — to a person's other devices, and into a backup.
 */
export const ACTIVITY_LOG = "logs/activity.jsonl"

/**
 * The version of a line's own shape — what every line has, and how its
 * parts sit beside that — written on each line. A part added, or a word,
 * is no new version: those are read past where unknown. A line of another
 * version is one this app cannot tell the shape of, and is passed over.
 */
const LINE_VERSION = 1

export type ActivityId = string & { readonly __brand: "ActivityId" }

/**
 * What a line may say a thing done was about, each a part of its own that
 * is there or not: the book's title, a file, several files, a parlor's
 * pool of savings, parlors, a tally — under `play`, the word written
 * already — a theoretical value, tallies taken in from another app, what a thing done to savings said — the day and the
 * tokens it named, the prizes they were exchanged for, the rate a pool was
 * made ready at: what was asked, never what it came to, so the asking can
 * be done again — and the changes it made to the book's files — every
 * file it touched but this log, as the lines replaced. A line is not one
 * of a closed list of shapes: it carries whichever parts apply, a new part
 * is added without touching the others, and whatever asks about a tally —
 * or a parlor, or a file — looks for that part and nothing else.
 */
export interface Parts {
  readonly book?: { readonly title: string }
  readonly file?: { readonly path: string }
  readonly files?: { readonly paths: readonly string[] }
  readonly pool?: { readonly parlor: string; readonly tier: string }
  readonly parlors?: { readonly names: readonly string[] }
  readonly play?: { readonly id: PlayId; readonly description: string }
  readonly theoretical?: { readonly value: Decimal }
  readonly imported?: { readonly from: string; readonly count: number }
  /** The day a thing done to savings was on, and the tokens it named, balls or medals: the count registered or put right to, or the tokens exchanged or taken back. */
  readonly savings?: { readonly date: IsoDate; readonly kind: TokenKind; readonly tokens: Decimal }
  /** What special prizes tokens were exchanged for were worth, in yen. */
  readonly prizes?: { readonly specialPrizes: Decimal }
  /** The rate a pool was made ready at, from a day. */
  readonly rate?: { readonly date: IsoDate; readonly rate: Decimal }
  readonly changes?: { readonly files: readonly FilePatch[] }
}

/**
 * One thing done to a book: a line that can be pointed at by its id, when
 * and by whom, what was done as a word of its own — one this app may not
 * know, from a later version — and the parts saying what it was done to.
 */
export interface ActivityLine {
  readonly id: ActivityId
  readonly at: string
  readonly by: MemberId
  readonly did: string
  readonly parts: Parts
}

/**
 * What a change did, as the word and the parts an activity line says it
 * in; nothing for a change the activity does not tell of — a press of the
 * heart or of a mark, which the book's favourites and marks record line by
 * line themselves, or a book moved in its owner's list or told the hour
 * its owner's business day turns over at, which change nothing the book
 * records.
 */
const saidOf = (intent: ChangeIntent): Pick<ActivityLine, "did" | "parts"> | undefined => {
  switch (intent.type) {
    case "favorite-kept":
    case "favorite-let-go":
    case "mark-pressed":
    case "book-placed":
    case "business-day-turn-set":
      return undefined
    case "book-created":
      return { did: intent.type, parts: {} }
    case "book-renamed":
      return { did: intent.type, parts: { book: { title: intent.title } } }
    case "file-edited":
      return { did: intent.type, parts: { file: { path: intent.path } } }
    case "savings-opened":
    case "savings-adjusted":
    case "savings-forfeited":
      return { did: intent.type, parts: { pool: { parlor: intent.parlor, tier: intent.tier }, savings: { date: intent.date, kind: intent.kind, tokens: intent.tokens } } }
    case "savings-exchanged":
      return { did: intent.type, parts: { pool: { parlor: intent.parlor, tier: intent.tier }, savings: { date: intent.date, kind: intent.kind, tokens: intent.tokens }, prizes: { specialPrizes: intent.specialPrizes } } }
    case "pool-opened":
      return { did: intent.type, parts: { pool: { parlor: intent.parlor, tier: intent.tier }, rate: { date: intent.date, rate: intent.rate } } }
    case "parlors-linked":
      return { did: intent.type, parts: { parlors: { names: intent.names } } }
    case "conflict-settled":
      return { did: intent.type, parts: { files: { paths: intent.paths } } }
    case "plays-imported":
      return { did: intent.type, parts: { imported: { from: intent.from, count: intent.count } } }
    case "play-removed":
      return { did: intent.type, parts: { play: { id: intent.playId, description: intent.description } } }
    case "play-recorded":
    case "play-revised":
      return {
        did: intent.type,
        parts: {
          play: { id: intent.playId, description: intent.description },
          ...(intent.theoreticalValue === undefined ? {} : { theoretical: { value: intent.theoreticalValue } }),
        },
      }
  }
}

/** What a change is told from: its who, when and why, and what it did to each file. */
export type Told = Pick<JournalChange, "at" | "author" | "intent" | "files">

/** What a change did to the book's files, as the part a line holds it in: every file but this log, and no part where it touched none. */
const changesOf = (files: readonly FilePatch[]): Pick<Parts, "changes"> => {
  const told = files.filter((patch) => patch.path !== ACTIVITY_LOG)
  return told.length === 0 ? {} : { changes: { files: told } }
}

/** A change as a line of the book's activity: its who, when and why, and what it did, under an id of the line's own. None for a change the activity does not tell of. */
export const activityLineOf = (id: string, change: Told): ActivityLine | undefined => {
  const said = saidOf(change.intent)
  return said === undefined ? undefined : { id: id as ActivityId, at: change.at, by: change.author, did: said.did, parts: { ...said.parts, ...changesOf(change.files) } }
}

/** The changes the activity tells of, each as its line, in the order given. */
export const activityLinesOf = (changes: readonly { readonly id: string; readonly change: Told }[]): readonly ActivityLine[] =>
  changes.flatMap((each) => ((line) => (line === undefined ? [] : [line]))(activityLineOf(each.id, each.change)))

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === "object" && value !== null && !Array.isArray(value)

const isDecimal = (value: unknown): value is Decimal => isRecord(value) && typeof value["mantissa"] === "bigint" && typeof value["places"] === "number"

const isNames = (value: unknown): value is readonly string[] => Array.isArray(value) && value.every((name) => typeof name === "string")

/** A line as it is written: its version, then its parts beside what every line has, a decimal as its digits, since JSON has no number that keeps them. */
const lineText = (line: ActivityLine): string =>
  JSON.stringify({ v: LINE_VERSION, id: line.id, at: line.at, by: line.by, did: line.did, ...line.parts }, (_key, value: unknown) => (isDecimal(value) ? toPlainString(value) : value))

/** One part read where it is there and reads as itself; a part that does not is left out, and the line stands without it. */
const part = <K extends keyof Parts>(name: K, read: (fields: Readonly<Record<string, unknown>>) => Parts[K] | undefined, from: Readonly<Record<string, unknown>>): Pick<Parts, K> | undefined => {
  const fields = from[name]
  const found = isRecord(fields) ? read(fields) : undefined
  return found === undefined ? undefined : ({ [name]: found } as Pick<Parts, K>)
}

const decimalOf = (value: unknown): Decimal | undefined => {
  const read = typeof value === "string" ? parseDecimal(value) : undefined
  return read?.ok === true ? read.value : undefined
}

const isTokenKind = (value: unknown): value is TokenKind => value === "ball" || value === "medal"

const dateOf = (value: unknown): IsoDate | undefined => {
  const read = typeof value === "string" ? parseIsoDate(value) : undefined
  return read?.ok === true ? read.value : undefined
}

const partsOf = (line: Readonly<Record<string, unknown>>): Parts => ({
  ...part("book", ({ title }) => (typeof title === "string" ? { title } : undefined), line),
  ...part("file", ({ path }) => (typeof path === "string" ? { path } : undefined), line),
  ...part("files", ({ paths }) => (isNames(paths) ? { paths } : undefined), line),
  ...part("pool", ({ parlor, tier }) => (typeof parlor === "string" && typeof tier === "string" ? { parlor, tier } : undefined), line),
  ...part("parlors", ({ names }) => (isNames(names) ? { names } : undefined), line),
  ...part("play", ({ id, description }) => (typeof id === "string" && typeof description === "string" ? { id: id as PlayId, description } : undefined), line),
  ...part("imported", ({ from, count }) => (typeof from === "string" && typeof count === "number" ? { from, count } : undefined), line),
  ...part("theoretical", ({ value }) => ((found) => (found === undefined ? undefined : { value: found }))(decimalOf(value)), line),
  ...part("savings", ({ date, kind, tokens }) => ((day, count) => (day === undefined || count === undefined || !isTokenKind(kind) ? undefined : { date: day, kind, tokens: count }))(dateOf(date), decimalOf(tokens)), line),
  ...part("prizes", ({ specialPrizes }) => ((found) => (found === undefined ? undefined : { specialPrizes: found }))(decimalOf(specialPrizes)), line),
  ...part("rate", ({ date, rate }) => ((day, found) => (day === undefined || found === undefined ? undefined : { date: day, rate: found }))(dateOf(date), decimalOf(rate)), line),
  ...part("changes", ({ files }) => (Array.isArray(files) && files.every(isFilePatch) ? { files } : undefined), line),
})

const parsed = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

const lineOf = (text: string): ActivityLine | undefined => {
  const value = parsed(text)
  if (!isRecord(value) || value["v"] !== LINE_VERSION) return undefined
  const { id, at, by, did } = value
  if (typeof id !== "string" || id === "" || typeof at !== "string" || Number.isNaN(Date.parse(at)) || typeof by !== "string" || typeof did !== "string" || did === "") return undefined
  return { id: id as ActivityId, at, by: by as MemberId, did, parts: partsOf(value) }
}

/** Lines with each id's first and no other: two devices each putting in the same history write the same lines. */
const oncePerId = (lines: readonly ActivityLine[]): readonly ActivityLine[] => {
  const firsts = new Map(lines.toReversed().map((line) => [line.id, line]))
  return lines.filter((line) => firsts.get(line.id) === line)
}

/** Whether a line is none a version of this app wrote: not an object with a version, or of this version and not reading as one. A line a later version wrote is not. */
const isBroken = (text: string): boolean => {
  const value = parsed(text)
  if (!isRecord(value) || typeof value["v"] !== "number") return true
  return value["v"] === LINE_VERSION && lineOf(text) === undefined
}

/** The lines of an activity log that do not read, by number, for the person to be told that what it shows leaves them out. */
export const unreadableActivityLines = (text: string): readonly number[] => text.split("\n").flatMap((line, index) => (line.trim() !== "" && isBroken(line) ? [index + 1] : []))

/**
 * Every line of an activity log that reads as one, in the order written.
 * A line that does not read is passed over, not a reason to show nothing:
 * the file is the book's, and a person may have had a hand in it, and is
 * told of it beside (`unreadableActivityLines`). A part this app does not
 * know is passed over the same way, and its line read without it.
 */
export const activityOfText = (text: string): readonly ActivityLine[] =>
  oncePerId(
    text.split("\n").flatMap((line) => {
      const found = line.trim() === "" ? undefined : lineOf(line)
      return found === undefined ? [] : [found]
    }),
  )

/**
 * An activity log's text with the line a commit wrote in it saying what the
 * commit does now: the commit was made again on files that had moved on, so
 * what it did to each is no longer what its line was first given. `added`
 * is the lines the commit put in the log, its own the last of them that
 * tells of changes. Only that part of the line is written over, as text,
 * so a part this version does not know stays as it was.
 */
export const retold = (text: string, added: readonly string[], files: readonly FilePatch[]): string => {
  const own = added.map(lineOf).findLast((line) => line?.parts.changes !== undefined)
  if (own === undefined) return text
  return text
    .split("\n")
    .map((each) => {
      const value = parsed(each)
      return isRecord(value) && value["v"] === LINE_VERSION && value["id"] === own.id ? JSON.stringify({ ...value, ...changesOf(files) }) : each
    })
    .join("\n")
}

/** An activity log's text with these lines after what it holds. */
const withLines = (text: string, lines: readonly ActivityLine[]): string =>
  `${text === "" || text.endsWith("\n") ? text : `${text}\n`}${lines.map((line) => `${lineText(line)}\n`).join("")}`

/**
 * A book's files with one more thing done to it written in its activity —
 * or, for a change the activity does not tell of, with nothing more. A
 * book that has no activity log yet is given one first, holding `before`:
 * what its history says was done to it until now, oldest first.
 */
export const withActivity = (files: BookFiles, before: readonly ActivityLine[], line: ActivityLine | undefined): BookFiles => {
  const held = files[ACTIVITY_LOG]
  const added = [...(held === undefined ? before : []), ...(line === undefined ? [] : [line])]
  return held !== undefined && added.length === 0 ? files : { ...files, [ACTIVITY_LOG]: withLines(held ?? "", added) }
}

/**
 * What was done to a book, newest first: what its activity log says, or —
 * for a book that has none yet — what its history says, which is what its
 * log will be given when the book is next written.
 */
export const activityOf = (files: BookFiles, history: readonly ActivityLine[]): readonly ActivityLine[] => {
  const held = files[ACTIVITY_LOG]
  const lines = held === undefined ? history : activityOfText(held)
  return lines.toSorted((left, right) => Date.parse(right.at) - Date.parse(left.at))
}
