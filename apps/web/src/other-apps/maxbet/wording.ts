import { formatCount } from "../../ui/wording/numbers"
import { describeReadingProblem, ROWS_NAMED } from "../ui/import-wording"
import type { MaxbetProblem } from "./tags"

/** MAXBET, as its tabs and the book's activity call it. */
export const MAXBET_NAME = "MAXBET"

/** The press a book's line asks for a MAXBET file to take into it on: its backup or its CSV. */
export const IMPORT_CHOOSE_FILE = "ファイルを選ぶ"

/** Why a MAXBET file was not taken in, as a person is told. */
export const describeMaxbetProblem = (problem: MaxbetProblem): string => {
  switch (problem.type) {
    case "not-maxbet":
      return "MAXBET のファイルとして読めません。MAXBET から書き出したバックアップ（JSON）か CSV を選んでください。"
    case "records-unreadable":
      return `読めない収支があるため、取り込んでいません。${problem.records
        .slice(0, ROWS_NAMED)
        .map((record) => `${formatCount(record)}件目`)
        .join("、")}${problem.records.length > ROWS_NAMED ? ` ほか${formatCount(problem.records.length - ROWS_NAMED)}件` : ""}。`
    case "no-plays":
      return `${formatCount(problem.count)}件すべてが株・FX・競馬・競艇のタグの収支のため、取り込んでいません。`
    case "empty":
    case "rows-unreadable":
    case "stray-quote":
    case "unclosed-quote":
      return describeReadingProblem(problem)
  }
}
