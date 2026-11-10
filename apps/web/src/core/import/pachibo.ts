import { parseIsoDate, type IsoDate } from "../calendar/calendar"
import { decimal, type Decimal } from "../decimal/decimal"
import type { PlayGameKind } from "../play/play"
import { Err, Ok, type Result } from "../result/result"
import type { SourceTally } from "./source-tally"

/** ぱち簿, as an imported tally says where it came from. */
export const PACHIBO = "pachibo"

/**
 * A value of ぱち簿's file, as its type names it: a truth, a whole number
 * (`Integer` and `Long` alike), or a text — and a type the reading does
 * not know is read as its text.
 */
type Stored = { readonly type: "truth"; readonly value: boolean } | { readonly type: "whole"; readonly value: number } | { readonly type: "text"; readonly value: string }

type StoredMap = ReadonlyMap<string, Stored>

/**
 * Why a file is not taken in.
 *
 * - `not-pachibo`: it does not read as a file ぱち簿 wrote.
 * - `entries-unreadable`: these tallies, by their day and their place in it, lack what a tally needs.
 */
export type PachiboProblem =
  | { readonly type: "empty" }
  | { readonly type: "not-pachibo" }
  | { readonly type: "entries-unreadable"; readonly entries: readonly { readonly date: IsoDate; readonly index: number }[] }

/** Text from bytes read as UTF-8, none where they do not read so: given from outside, where the platform has a decoder. */
export type Utf8Reader = (bytes: Uint8Array) => string | undefined

const graphemes = new Intl.Segmenter("ja", { granularity: "grapheme" })

/**
 * Where a value said to be `length` long ends, among the characters from
 * `at`, by each way the length may have been counted — code points, UTF-16
 * units, graphemes — the first that ends it where a comma follows, as
 * ぱち簿 ends every value, or else at the file's end; none where none does.
 */
const valueEnd = (characters: readonly string[], at: number, length: number): number | undefined => {
  const byUnits = ((held: { units: number; end: number }) => {
    while (held.units < length && held.end < characters.length) {
      held.units += (characters[held.end] ?? "").length
      held.end += 1
    }
    return held.units === length ? held.end : undefined
  })({ units: 0, end: at })
  const byGraphemes = ((window: string) => {
    const segments = [...graphemes.segment(window)].slice(0, length)
    return segments.length === length ? at + [...segments.map((segment) => segment.segment).join("")].length : undefined
  })(characters.slice(at, at + length * 8 + 8).join(""))
  const ends = [at + length, byUnits, byGraphemes]
  return ends.find((end) => end !== undefined && characters[end] === ",") ?? ends.find((end) => end === characters.length)
}

const storedOf = (type: string, value: string): Stored | undefined => {
  switch (type) {
    case "Boolean":
      return value === "true" || value === "false" ? { type: "truth", value: value === "true" } : undefined
    case "Integer":
    case "Long":
      return /^-?\d+$/.test(value) && Number.isSafeInteger(Number(value)) ? { type: "whole", value: Number(value) } : undefined
    default:
      return { type: "text", value }
  }
}

/** The text up to the next comma from `at`, and where the reading goes on after it; none where no comma follows. */
const fieldAt = (characters: readonly string[], at: number): { readonly field: string; readonly next: number } | undefined => {
  const comma = characters.indexOf(",", at)
  return comma < 0 ? undefined : { field: characters.slice(at, comma).join(""), next: comma + 1 }
}

/**
 * The values a ぱち簿 file holds by their keys, as it writes them one after
 * another: `type,key,length,value,`, the value as long as it says, so a
 * comma or a line break inside it is the value's own. None where the text
 * does not read so.
 */
const storedMapOf = (text: string): StoredMap | undefined => {
  const characters = [...text]
  const found = new Map<string, Stored>()
  for (let at = 0; at < characters.length; ) {
    const type = fieldAt(characters, at)
    const key = type === undefined ? undefined : fieldAt(characters, type.next)
    const length = key === undefined ? undefined : fieldAt(characters, key.next)
    if (type === undefined || key === undefined || length === undefined || !/^\d+$/.test(length.field)) return undefined
    const end = valueEnd(characters, length.next, Number(length.field))
    const stored = end === undefined ? undefined : storedOf(type.field, characters.slice(length.next, end).join(""))
    if (end === undefined || stored === undefined) return undefined
    found.set(key.field, stored)
    at = end + 1
  }
  return found
}

const wholeAt = (stored: StoredMap, key: string): number | undefined => ((value) => (value?.type === "whole" ? value.value : undefined))(stored.get(key))

const textAt = (stored: StoredMap, key: string): string => ((value) => (value?.type === "text" ? value.value.trim() : ""))(stored.get(key))

/**
 * The words ぱち簿 lets a person tag a tally with, by the bit each is kept
 * in: one list for both games, the rates of each game's tokens first.
 */
export const LABEL_BITS: readonly string[] = ["20スロ", "10スロ", "5スロ", "4パチ", "2パチ", "1パチ", "角台", "新台", "初打ち", "バラエティ", "イベント", "雨", "朝一", "ハイエナ", "ノリ打ち", "甘デジ"]

const labelsOf = (bits: number): readonly string[] => LABEL_BITS.filter((_, bit) => Math.floor(bits / 2 ** bit) % 2 === 1)

/** The code ぱち簿's pachislot machines begin from, its pachinko machines' all below it. */
export const PACHISLOT_CODES_FROM = 10_000

const gameKindOf = (machineCode: number | undefined): PlayGameKind | undefined => (machineCode === undefined || machineCode < 0 ? undefined : machineCode >= PACHISLOT_CODES_FROM ? "pachislot" : "pachinko")

/** A time on a clock as ぱち簿 keeps it, `1940` for 19:40, in minutes from midnight; none where it is unsaid (`-1`) or no time. */
const clockMinutes = (kept: number | undefined): number | undefined => (kept === undefined || kept < 0 || kept % 100 >= 60 ? undefined : Math.floor(kept / 100) * 60 + (kept % 100))

/**
 * How long a tally's play lasted, in hours to the hundredth: from its start
 * to its end where it says both — past midnight where it ends before it
 * started — or else its hours and minutes as it keeps them, `905` for nine
 * hours and five minutes; none where it says neither.
 */
const hoursOf = (start: number | undefined, end: number | undefined, kept: number | undefined): Decimal | undefined => {
  const [from, to] = [clockMinutes(start), clockMinutes(end)]
  const minutes = from !== undefined && to !== undefined && to !== from ? (to - from + 24 * 60) % (24 * 60) : (clockMinutes(kept) ?? 0)
  const hundredths = Math.round((minutes * 100) / 60)
  return hundredths > 0 ? decimal(BigInt(hundredths), 2) : undefined
}

/** A sum of yen a tally keeps: whole and not below nothing, one it leaves out none at all where it may. */
const yenAt = (stored: StoredMap, key: string, required: boolean): Decimal | undefined => ((value) => (value === undefined ? (required ? undefined : decimal(0n, 0)) : value < 0 ? undefined : decimal(BigInt(value), 0)))(wholeAt(stored, key))

/**
 * One tally of ぱち簿's, by its day and its place among the day's: what went
 * in as savings drawn and as cash, what came back into savings and as
 * cash — each pair summed, as ぱち簿 sums them for the day's result — with
 * its parlor, its machine and their codes, its cabinet, its hours, its
 * labels and its memo. None where it lacks what a tally needs.
 */
const tallyAt = (stored: StoredMap, date: IsoDate, index: number): SourceTally | undefined => {
  const at = (field: string): string => `item${date.replaceAll("-", "")}_${String(index)}_${field}`
  const [drawn, cash, saved, cashBack] = [yenAt(stored, at("invest"), true), yenAt(stored, at("invest2"), false), yenAt(stored, at("recovery"), true), yenAt(stored, at("recovery2"), false)]
  if (drawn === undefined || cash === undefined || saved === undefined || cashBack === undefined) return undefined
  const [parlorCode, machineCode, cabinet] = [wholeAt(stored, at("hall_id")), wholeAt(stored, at("machine_id")), wholeAt(stored, at("number"))]
  return {
    date,
    parlor: parlorCode === undefined || parlorCode < 0 ? { name: "", code: "" } : { name: textAt(stored, `hall${String(parlorCode)}_name`), code: String(parlorCode) },
    machine: machineCode === undefined || machineCode < 0 ? { name: "", code: "", maker: "" } : { name: textAt(stored, `machine${String(machineCode)}_name`), code: String(machineCode), maker: textAt(stored, `machine${String(machineCode)}_maker`) },
    cabinetNumber: cabinet === undefined || cabinet <= 0 ? "" : String(cabinet),
    outlay: decimal(drawn.mantissa + cash.mantissa, 0),
    takings: decimal(saved.mantissa + cashBack.mantissa, 0),
    memo: textAt(stored, at("memo")),
    hours: hoursOf(wholeAt(stored, at("start")), wholeAt(stored, at("end")), wholeAt(stored, at("time"))),
    gameKind: gameKindOf(machineCode),
    countedSpins: undefined,
    countedJackpots: undefined,
    sourceLabels: labelsOf(wholeAt(stored, at("tag")) ?? 0),
  }
}

const DAY_COUNT = /^item(\d{4})(\d{2})(\d{2})_count$/

/** The days a file keeps tallies on, each with how many, in the order of the days. */
const daysOf = (stored: StoredMap): readonly { readonly date: IsoDate; readonly count: number }[] =>
  [...stored.keys()]
    .flatMap((key) => {
      const read = DAY_COUNT.exec(key)
      const date = read === null ? undefined : parseIsoDate(`${read[1] ?? ""}-${read[2] ?? ""}-${read[3] ?? ""}`)
      const count = wholeAt(stored, key)
      return date?.ok === true && count !== undefined && count > 0 ? [{ date: date.value, count }] : []
    })
    .sort((left, right) => left.date.localeCompare(right.date))

/**
 * The tallies a file ぱち簿 wrote (`.pcb`) holds, by their days and in each
 * day in ぱち簿's order, or why it is not taken in. Its bytes are each
 * turned over, and so turned back read as UTF-8. Its parlors' savings are
 * not read: a tally kept in yen moves none.
 */
export const readPachibo = (bytes: Uint8Array, utf8: Utf8Reader): Result<readonly SourceTally[], PachiboProblem> => {
  const text = utf8(bytes.map((byte) => 255 - byte))
  const stored = text === undefined || text === "" ? undefined : storedMapOf(text)
  if (stored === undefined) return Err({ type: "not-pachibo" })
  const read = daysOf(stored).flatMap(({ date, count }) => Array.from({ length: count }, (_, index) => ({ date, index, tally: tallyAt(stored, date, index) })))
  if (read.length === 0) return Err({ type: "empty" })
  const unreadable = read.filter((entry) => entry.tally === undefined).map(({ date, index }) => ({ date, index }))
  return unreadable.length > 0 ? Err({ type: "entries-unreadable", entries: unreadable }) : Ok(read.flatMap((entry) => (entry.tally === undefined ? [] : [entry.tally])))
}
