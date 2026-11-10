import type { Imported, ImportError, TakingProblem } from "../application/import"
import type { RowField } from "../core/cells"
import type { ReadingProblem } from "../core/reading-problem"
import { describeError } from "../../ui/wording/errors"
import { formatCount } from "../../ui/wording/numbers"

const FIELDS: Readonly<Record<RowField, string>> = { date: "日付", outlay: "投資額", takings: "回収額", result: "収支", hours: "稼働時間", gameKind: "種別", countedSpins: "回転数", countedJackpots: "大当り" }

/** How many unreadable rows or tallies are named before the rest are only counted. */
export const ROWS_NAMED = 5

/** Why a file does not read, whichever app's it is, as a person is told: each app's own reasons are its wording's. */
export const describeReadingProblem = (problem: ReadingProblem): string => {
  switch (problem.type) {
    case "empty":
      return "ファイルに収支がありません。"
    case "rows-unreadable":
      return `読めない行があるため、取り込んでいません。${problem.rows
        .slice(0, ROWS_NAMED)
        .map((row) => `${row.line}行目の${row.fields.map((field) => FIELDS[field]).join("・")}`)
        .join("、")}${problem.rows.length > ROWS_NAMED ? ` ほか${formatCount(problem.rows.length - ROWS_NAMED)}行` : ""}。`
    case "stray-quote":
      return `${problem.line}行目に、セルの途中か閉じたあとにある「"」があるため、CSV として読めません。`
    case "unclosed-quote":
      return `${problem.line}行目までに閉じていない「"」があるため、CSV として読めません。`
  }
}

/** Why taking a file in came to nothing, whichever app's it is, as a person is told. */
const describeTakingProblem = (problem: TakingProblem): string => {
  switch (problem.type) {
    case "not-utf8":
      return "UTF-8 の文字として読めない箇所があるため、取り込んでいません。アプリから書き出したままのファイルを選んでください。"
    case "nothing-new":
      return `この${formatCount(problem.count)}件はすべて取り込み済みです。`
    case "no-game-said":
      return `${formatCount(problem.count)}件すべてに、パチンコかパチスロのどちらか1つのタグがついていません。取り込むには「${UNTAGGED_TAKEN}」にチェックを入れてください。`
  }
}

/** Why a file of an app's was not taken in, as a person is told: why its reading does not read in that app's words (`describe`), and any other reason in the app's. */
export const describeImportError = <P>(error: ImportError<P>, describe: (problem: P) => string): string => {
  if (error.type === "unread") return describe(error.problem)
  if (error.type === "import") return describeTakingProblem(error.problem)
  return describeError(error)
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
    imported.otherThanPlay === 0 ? "" : `株・FX・競馬・競艇のタグの${formatCount(imported.otherThanPlay)}件は取り込んでいません。`,
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

/** The press a book's line asks for a file to take into it on. */
export const IMPORT_CHOOSE = "CSVを選ぶ"

/** The tick that takes in, beside those tagged パチンコ or パチスロ, the tallies of a file tagged neither. */
export const UNTAGGED_TAKEN = "タグなしの収支も取り込む"

/** How many of a file's tallies are not tagged パチンコ or パチスロ alone, above the tick that takes them in. */
export const untaggedText = (count: number, of: number): string => `${formatCount(of)}件のうち${formatCount(count)}件に、パチンコかパチスロのどちらか1つのタグがついていません。`

/** A file chosen being read and looked at, before anything is asked of it. */
export const IMPORT_READING = "ファイルを読み込み中…"

/** A file's tallies being written into the book. */
export const IMPORT_WRITING = "取り込み中…"

/** The press a weighing is stopped on. */
export const IMPORT_STOP = "中止"

/** A taking in that broke off with nothing said of why: nothing is written twice, so the same file can be chosen again. */
export const IMPORT_BROKEN = "取り込みが途中で止まりました。同じファイルをもう一度選ぶと、まだの分から続けます。"
