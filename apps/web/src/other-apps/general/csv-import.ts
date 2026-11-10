import { ZERO, compare, negate, type Decimal } from "../../core/decimal/decimal"
import { Err, Ok, type Result } from "../../core/result/result"
import { countOf, dayOf, gameKindOf, hoursOf, labelsOf, signedYenOf, unreadableOf, yenOf, type RowField, type RowsUnreadable } from "../core/cells"
import { machineKeyOf } from "../../core/catalog/description"
import { rowsOfCsv, type CsvProblem } from "../core/csv-rows"
import type { SourceTally } from "../core/source-tally"

/** A CSV of a person's own making, its columns tied to this app's fields by them, as an imported tally says where it came from. */
export const GENERAL = "csv"

/** What a column of a person's own file may be taken in as: this app's fields a tally is read from. */
export type Field = "date" | "outlay" | "takings" | "result" | "parlor" | "machine" | "gameKind" | "cabinetNumber" | "hours" | "spins" | "jackpots" | "memo" | "labels"

/** The fields in the order a person is offered them. */
export const FIELDS: readonly Field[] = ["date", "outlay", "takings", "result", "parlor", "machine", "gameKind", "cabinetNumber", "hours", "spins", "jackpots", "memo", "labels"]

/** A file of a person's own making as it was read: its first row's names, the rows under it, and how many columns the widest row has. */
export interface Sheet {
  readonly header: readonly string[]
  readonly rows: readonly (readonly string[])[]
  readonly width: number
}

/** The field each column of a sheet is taken in as, by the column's place: none where it is left out. */
export type Mapping = readonly (Field | undefined)[]

/**
 * Why a file of a person's own making is not taken in.
 *
 * - `unmapped`: no column is taken in as one of the fields a tally needs — its day, and what went in and came back or what it came to.
 * - `rows-unreadable`: these rows do not read.
 */
export type GeneralProblem = { readonly type: "empty" } | { readonly type: "unmapped"; readonly missing: readonly ("date" | "sides")[] } | RowsUnreadable | CsvProblem

/** A file as a sheet: its first row taken as the columns' names, and nothing to take in where it holds no row under them. */
export const sheetOf = (text: string): Result<Sheet, GeneralProblem> => {
  const csv = rowsOfCsv(text)
  if (!csv.ok) return csv
  const [header, ...rows] = csv.value
  if (header === undefined || rows.length === 0) return Err({ type: "empty" })
  return Ok({ header: header.map((name) => name.trim()), rows, width: Math.max(header.length, ...rows.map((row) => row.length)) })
}

/** The names a column is usually headed by for each field, as a search compares text. */
const USUAL_NAMES: Readonly<Record<Field, readonly string[]>> = {
  date: ["日付", "日", "date", "年月日"],
  outlay: ["投資", "投資額", "投資金額", "使った金額"],
  takings: ["回収", "回収額", "回収金額", "換金額"],
  result: ["収支", "勝ち負け", "損益", "差額"],
  parlor: ["店舗", "店舗名", "店", "ホール", "ホール名"],
  machine: ["機種", "機種名", "台"],
  gameKind: ["種別", "種類", "ジャンル"],
  cabinetNumber: ["台番号", "台番"],
  hours: ["稼働時間", "時間", "遊技時間"],
  spins: ["回転数", "総回転数", "ゲーム数", "総ゲーム数", "g数"],
  jackpots: ["大当り", "大当たり", "大当り回数", "大当たり回数", "当たり回数", "at回数", "ボーナス回数"],
  memo: ["メモ", "備考", "コメント"],
  labels: ["タグ"],
}

/**
 * The mapping a sheet's columns are first offered with: each column headed
 * by a name a field is usually headed by taken in as that field, the first
 * of them where two are; every other left out.
 */
export const guessedMapping = (sheet: Sheet): Mapping =>
  Array.from({ length: sheet.width }, (_, index) => machineKeyOf(sheet.header[index] ?? "")).reduce<readonly (Field | undefined)[]>((built, key) => {
    const field = FIELDS.find((each) => !built.includes(each) && USUAL_NAMES[each].some((name) => machineKeyOf(name) === key))
    return [...built, key === "" ? undefined : field]
  }, [])

/** A mapping with a column taken in as a field — or left out — and the field taken from any other column it was: a field is read from one column. */
export const withColumn = (mapping: Mapping, index: number, field: Field | undefined): Mapping => mapping.map((each, at) => (at === index ? field : each === field ? undefined : each))

/** What a mapping lacks for a tally to be read: its day, and what went in and came back, or what it came to. */
export const missingOf = (mapping: Mapping): readonly ("date" | "sides")[] => [
  ...(mapping.includes("date") ? [] : (["date"] as const)),
  ...((mapping.includes("outlay") && mapping.includes("takings")) || mapping.includes("result") ? [] : (["sides"] as const)),
]

/** A tally's two sides from what it came to alone: a loss as what went in and nothing back, a gain as nothing in and it back. */
const sidesOfResult = (result: Decimal): readonly [Decimal, Decimal] => (compare(result, ZERO) < 0 ? [negate(result), ZERO] : [ZERO, result])

type Cell = (field: Field) => string

/** A tally's two sides: what went in and came back where both are taken in, or else what it came to. */
const sidesOf = (cell: Cell, bySides: boolean): Result<readonly [Decimal, Decimal], readonly RowField[]> => {
  if (!bySides) return ((result) => (result === undefined ? Err(["result"]) : Ok(sidesOfResult(result))))(signedYenOf(cell("result")))
  const [outlay, takings] = [yenOf(cell("outlay")), yenOf(cell("takings"))]
  return outlay === undefined || takings === undefined ? Err([...(outlay === undefined ? (["outlay"] as const) : []), ...(takings === undefined ? (["takings"] as const) : [])]) : Ok([outlay, takings])
}

const tallyOf = (cell: Cell, bySides: boolean): Result<SourceTally, readonly RowField[]> => {
  const [date, sides, gameKind, hours, spins, jackpots] = [dayOf(cell("date")), sidesOf(cell, bySides), gameKindOf(cell("gameKind")), hoursOf(cell("hours")), countOf(cell("spins")), countOf(cell("jackpots"))]
  if (date === undefined || !sides.ok || !gameKind.ok || !hours.ok || !spins.ok || !jackpots.ok)
    return Err([
      ...(date === undefined ? (["date"] as const) : []),
      ...(sides.ok ? [] : sides.error),
      ...(gameKind.ok ? [] : (["gameKind"] as const)),
      ...(hours.ok ? [] : (["hours"] as const)),
      ...(spins.ok ? [] : (["countedSpins"] as const)),
      ...(jackpots.ok ? [] : (["countedJackpots"] as const)),
    ])
  const [outlay, takings] = sides.value
  return Ok({
    date,
    parlor: { name: cell("parlor").trim(), code: "" },
    machine: { name: cell("machine").trim(), code: "", maker: "" },
    cabinetNumber: cell("cabinetNumber").trim(),
    outlay,
    takings,
    memo: cell("memo").trim(),
    hours: hours.value,
    clock: undefined,
    theoreticalValue: undefined,
    gameKind: gameKind.value,
    countedSpins: spins.value,
    countedJackpots: jackpots.value,
    sourceLabels: labelsOf(cell("labels")),
  })
}

/**
 * The tallies a sheet holds, read by the mapping, in the file's order, or
 * why it is not taken in. Where what went in and what came back are both
 * taken in they are read, and what it came to is not; where only what it
 * came to is, a loss is what went in and a gain what came back. A field
 * no column is taken in as reads as empty.
 */
export const readGeneral = (sheet: Sheet, mapping: Mapping): Result<readonly SourceTally[], GeneralProblem> => {
  const missing = missingOf(mapping)
  if (missing.length > 0) return Err({ type: "unmapped", missing })
  const bySides = mapping.includes("outlay") && mapping.includes("takings")
  const read = sheet.rows.map((row) => tallyOf((field) => ((index) => (index < 0 ? "" : (row[index] ?? "")))(mapping.indexOf(field)), bySides))
  const unreadable = unreadableOf(read)
  return unreadable === undefined ? Ok(read.flatMap((tally) => (tally.ok ? [tally.value] : []))) : Err(unreadable)
}
