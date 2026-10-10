import type { ImportProblem } from "../../application/errors"
import type { Imported } from "../../application/import"
import { PRECORD, type RowField } from "../../core/import/precord"
import { formatCount } from "./numbers"

const SOURCES: Readonly<Record<string, string>> = { [PRECORD]: "pRecord" }

/** What an app plays were taken in from is called; one this app does not know goes by its own word. */
export const sourceName = (from: string): string => SOURCES[from] ?? from

const FIELDS: Readonly<Record<RowField, string>> = { date: "日付", outlay: "投資額", takings: "回収額" }

/** How many unreadable rows are named before the rest are only counted. */
const ROWS_NAMED = 5

/** Why a file was not taken in, as a person is told. */
export const describeImportProblem = (problem: ImportProblem): string => {
  switch (problem.type) {
    case "empty":
      return "ファイルに収支がありません。"
    case "not-precord":
      return `pRecord の CSV として読めません。1行目に ${problem.missing.join("・")} の列がありません。`
    case "rows-unreadable":
      return `読めない行があるため、取り込んでいません。${problem.rows
        .slice(0, ROWS_NAMED)
        .map((row) => `${row.line}行目の${row.fields.map((field) => FIELDS[field]).join("・")}`)
        .join("、")}${problem.rows.length > ROWS_NAMED ? ` ほか${formatCount(problem.rows.length - ROWS_NAMED)}行` : ""}。`
    case "nothing-new":
      return `この${formatCount(problem.count)}件はすべて取り込み済みです。`
  }
}

/** How a taking in went, in a line. */
export const importedText = (imported: Imported): string =>
  imported.alreadyHere === 0 ? `${formatCount(imported.written)}件を取り込みました。` : `${formatCount(imported.written)}件を取り込みました（${formatCount(imported.alreadyHere)}件は取り込み済み）。`
