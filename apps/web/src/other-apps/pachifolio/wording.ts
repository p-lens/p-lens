import { describeReadingProblem } from "../ui/import-wording"
import type { PachifolioProblem } from "./csv-import"

/** パチフォリオ, as its tabs and the book's activity call it. */
export const PACHIFOLIO_NAME = "パチフォリオ"

/** Why a パチフォリオ file was not taken in, as a person is told. */
export const describePachifolioProblem = (problem: PachifolioProblem): string =>
  problem.type === "not-pachifolio" ? `パチフォリオの CSV として読めません。1行目に ${problem.missing.join("・")} の列がありません。` : describeReadingProblem(problem)
