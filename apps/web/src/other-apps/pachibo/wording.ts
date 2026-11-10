import { formatCount } from "../../ui/wording/numbers"
import { describeReadingProblem, ROWS_NAMED } from "../ui/import-wording"
import type { PachiboProblem } from "./pcb-import"

/** ぱち簿, as its tabs and the book's activity call it. */
export const PACHIBO_NAME = "ぱち簿"

/** The press a book's line asks for a ぱち簿 file to take into it on. */
export const IMPORT_CHOOSE_PCB = "pcbを選ぶ"

/** Why a ぱち簿 file was not taken in, as a person is told. */
export const describePachiboProblem = (problem: PachiboProblem): string => {
  switch (problem.type) {
    case "not-pachibo":
      return "ぱち簿のファイルとして読めません。ぱち簿から書き出した pcb ファイルを選んでください。"
    case "entries-unreadable":
      return `読めない収支があるため、取り込んでいません。${problem.entries
        .slice(0, ROWS_NAMED)
        .map((entry) => `${entry.date.replaceAll("-", "/")}の${formatCount(entry.index + 1)}件目`)
        .join("、")}${problem.entries.length > ROWS_NAMED ? ` ほか${formatCount(problem.entries.length - ROWS_NAMED)}件` : ""}。`
    case "empty":
      return describeReadingProblem(problem)
  }
}
