import { describeReadingProblem } from "../ui/import-wording"
import type { ManekuruProblem } from "./csv-import"

/** マネクルSP, as its tabs and the book's activity call it. */
export const MANEKURU_NAME = "マネクルSP"

/** Why a マネクルSP file was not taken in, as a person is told. */
export const describeManekuruProblem = (problem: ManekuruProblem): string =>
  problem.type === "not-manekuru" ? `マネクルSP の CSV として読めません。1行目に ${problem.missing.join("・")} の列がありません。` : describeReadingProblem(problem)
