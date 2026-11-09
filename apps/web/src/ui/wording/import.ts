import type { ImportProblem } from "../../application/errors"
import type { Imported } from "../../application/import"
import type { RowField } from "../../core/import/cells"
import { GENERAL, type Field } from "../../core/import/general"
import { PACHIFOLIO } from "../../core/import/pachifolio"
import { PRECORD } from "../../core/import/precord"
import { formatCount } from "./numbers"

const SOURCES: Readonly<Record<string, string>> = { [GENERAL]: "汎用形式", [PRECORD]: "pRecord", [PACHIFOLIO]: "パチフォリオ" }

/** What an app tallies were taken in from is called; one this app does not know goes by its own word. */
export const sourceName = (from: string): string => SOURCES[from] ?? from

const FIELDS: Readonly<Record<RowField, string>> = { date: "日付", outlay: "投資額", takings: "回収額", result: "収支", hours: "稼働時間", gameKind: "種別", countedSpins: "回転数", countedJackpots: "大当り" }

/** How many unreadable rows are named before the rest are only counted. */
const ROWS_NAMED = 5

/** Why a file was not taken in, as a person is told. */
export const describeImportProblem = (problem: ImportProblem): string => {
  switch (problem.type) {
    case "empty":
      return "ファイルに収支がありません。"
    case "not-precord":
      return `pRecord の CSV として読めません。1行目に ${problem.missing.join("・")} の列がありません。`
    case "unmapped":
      return `取り込む項目に${problem.missing.map((missing) => (missing === "date" ? "日付" : "「投資と回収」か「収支」")).join("と")}を選んでください。`
    case "not-pachifolio":
      return `パチフォリオの CSV として読めません。1行目に ${problem.missing.join("・")} の列がありません。`
    case "rows-unreadable":
      return `読めない行があるため、取り込んでいません。${problem.rows
        .slice(0, ROWS_NAMED)
        .map((row) => `${row.line}行目の${row.fields.map((field) => FIELDS[field]).join("・")}`)
        .join("、")}${problem.rows.length > ROWS_NAMED ? ` ほか${formatCount(problem.rows.length - ROWS_NAMED)}行` : ""}。`
    case "stray-quote":
      return `${problem.line}行目に、セルの途中か閉じたあとにある「"」があるため、CSV として読めません。`
    case "unclosed-quote":
      return `${problem.line}行目までに閉じていない「"」があるため、CSV として読めません。`
    case "not-utf8":
      return "UTF-8 の文字として読めない箇所があるため、取り込んでいません。アプリから書き出したままのファイルを選んでください。"
    case "nothing-new":
      return `この${formatCount(problem.count)}件はすべて取り込み済みです。`
  }
}

/** How a taking in went, in a line: the tallies written — or that every one was here already — those already here, those given an inferred theoretical value where any were, those weighed and not read where any were, those weighed whose entry had been changed since where any were, and those the person stopped the weighing before, which the same file chosen again weighs. */
export const importedText = (imported: Imported): string =>
  [
    imported.written === 0
      ? `${formatCount(imported.alreadyHere)}件はすべて取り込み済みです。`
      : imported.alreadyHere === 0
        ? `${formatCount(imported.written)}件を取り込みました。`
        : `${formatCount(imported.written)}件を取り込みました（${formatCount(imported.alreadyHere)}件は取り込み済み）。`,
    imported.inferred === 0 ? "" : `${imported.written === 0 ? "" : "うち"}${formatCount(imported.inferred)}件に推定期待値をつけました。`,
    imported.unread === 0 ? "" : `推論できず${formatCount(imported.unread)}件。`,
    imported.changed === 0 ? "" : `${formatCount(imported.changed)}件は取り込み後に書き換わっていたため、推定期待値をつけていません。`,
    imported.left === 0 ? "" : `中止したため、${formatCount(imported.left)}件は推定していません。同じファイルをもう一度選ぶと、続きから推定します。`,
  ].join("")

/** How far the weighing of a file's tallies has got, and that the one under way is being played out again, many more times, where it is. */
export const weighedText = (done: number, of: number, beyond: boolean): string => `${beyond ? "通常に加え、追加の推論をしています…" : "推定中…"} ${formatCount(done)} / ${formatCount(of)}件`

/** About how long the rest of a weighing should take, at the pace it has gone at: in minutes, and in hours and minutes past an hour. */
export const timeLeftText = (seconds: number): string => {
  const minutes = Math.ceil(seconds / 60)
  if (seconds < 60) return "あと1分足らず"
  return minutes < 60 ? `あと約${formatCount(minutes)}分` : `あと約${formatCount(Math.floor(minutes / 60))}時間${minutes % 60 === 0 ? "" : `${formatCount(minutes % 60)}分`}`
}

/** The tallies written, said while they are weighed after. */
export const writtenText = (written: number, alreadyHere: number): string => (written === 0 ? `${formatCount(alreadyHere)}件は取り込み済みです。` : `${formatCount(written)}件を取り込みました。`)

/** This app's fields a column of a person's own file may be taken in as, as the person is offered them. */
export const FIELD_NAMES: Readonly<Record<Field, string>> = {
  date: "日付",
  outlay: "投資",
  takings: "回収",
  result: "収支",
  parlor: "店舗",
  machine: "機種",
  gameKind: "種別",
  cabinetNumber: "台番号",
  hours: "稼働時間",
  spins: "回転数・ゲーム数",
  jackpots: "大当り・AT・ボーナス",
  memo: "メモ",
  labels: "タグ",
}

/** The press that goes on from tying a file's columns to this app's fields. */
export const IMPORT_NEXT = "次へ"

/** A column left out of a taking in, as its choice says. */
export const NOT_TAKEN = "取り込まない"

/** The press a book's line asks for a file to take into it on. */
export const IMPORT_CHOOSE = "CSVを選ぶ"

/** A file chosen being read and looked at, before anything is asked of it. */
export const IMPORT_READING = "ファイルを読み込み中…"

/** A file's tallies being written into the book. */
export const IMPORT_WRITING = "取り込み中…"

/** The press a weighing is stopped on. */
export const IMPORT_STOP = "中止"

/** A taking in that broke off with nothing said of why: nothing is written twice, so the same file can be chosen again. */
export const IMPORT_BROKEN = "取り込みが途中で止まりました。同じファイルをもう一度選ぶと、まだの分から続けます。"
