import { describeReadingProblem } from "../ui/import-wording"
import type { MypachiProblem } from "./csv-import"

/** Myパチ収支表, as its tabs and the book's activity call it. */
export const MYPACHI_NAME = "Myパチ収支表"

/** Why a Myパチ収支表 file was not taken in, as a person is told. */
export const describeMypachiProblem = (problem: MypachiProblem): string => {
  switch (problem.type) {
    case "unreadable-text":
      return "Shift_JIS の文字としても UTF-8 の文字としても読めない箇所があるため、取り込んでいません。Myパチ収支表から書き出したままの CSV を選んでください。"
    case "not-mypachi":
      return `Myパチ収支表の CSV として読めません。${problem.missing.join("・")} の列がありません。`
    case "empty":
    case "rows-unreadable":
    case "stray-quote":
    case "unclosed-quote":
      return describeReadingProblem(problem)
  }
}
