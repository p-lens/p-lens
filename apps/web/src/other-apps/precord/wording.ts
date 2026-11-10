import { describeReadingProblem } from "../ui/import-wording"
import type { PrecordProblem } from "./csv-import"

/** pRecord, as its tabs and the book's activity call it. */
export const PRECORD_NAME = "pRecord"

/** Why a pRecord file was not taken in, as a person is told. */
export const describePrecordProblem = (problem: PrecordProblem): string =>
  problem.type === "not-precord" ? `pRecord の CSV として読めません。1行目に ${problem.missing.join("・")} の列がありません。` : describeReadingProblem(problem)
