import { comparableName, isHitChanceText, keptName, MACHINE_KEYWORDS } from "@p-lens/contracts"

import { Err, Ok, type Result } from "../result/result"
import { searchKeyOf } from "../text/search-key"
import type { MachineSummary } from "./catalog"

/** Text as a machine search compares it: as any search does, and without the stars a machine's name is written with — ひかり☆ルミエ is ひかりルミエ. */
const machineKeyOf = (text: string): string => searchKeyOf(text).replace(/[☆★]/g, "")

/** Whether a machine is found by what was typed: by its name, its model name or any word it is searched by. */
export const machineMatches = (machine: Pick<MachineSummary, "name" | "modelName" | "keywords">, typed: string): boolean => {
  const wanted = machineKeyOf(typed)
  return wanted === "" || [machine.name, machine.modelName ?? "", ...machine.keywords].some((text) => machineKeyOf(text).includes(wanted))
}

/**
 * What a new machine's description, as typed, is wrong with.
 *
 * - `too-many-keywords`, `keyword-too-long`: beyond what the catalog takes.
 * - `not-a-hit-chance`: not written as a spec sheet writes one, `1/319.7`.
 */
export type DescriptionProblem =
  | { readonly type: "too-many-keywords"; readonly most: number }
  | { readonly type: "keyword-too-long"; readonly keyword: string; readonly longest: number }
  | { readonly type: "not-a-hit-chance" }

/** The words typed into one field, parted by commas of either width or 、, each once however it is written. */
const wordsOf = (typed: string): readonly string[] => {
  const words = typed
    .split(/[,，、]/)
    .map((word) => word.trim())
    .filter((word) => word !== "")
  return words.filter((word, index) => words.findIndex((other) => comparableName(other) === comparableName(word)) === index)
}

/** The words a machine is to be searched by, as typed into one field; none typed is none. */
export const readKeywords = (typed: string): Result<readonly string[], DescriptionProblem> => {
  const words = wordsOf(typed)
  const long = words.find((word) => [...word].length > MACHINE_KEYWORDS.length)
  if (long !== undefined) return Err({ type: "keyword-too-long", keyword: long, longest: MACHINE_KEYWORDS.length })
  return words.length > MACHINE_KEYWORDS.count ? Err({ type: "too-many-keywords", most: MACHINE_KEYWORDS.count }) : Ok(words)
}

/** A 大当り確率 as typed, whatever its width, as a spec sheet writes it; none typed is none. */
export const readHitChance = (typed: string): Result<string | undefined, DescriptionProblem> => {
  const written = typed.normalize("NFKC").replace(/\s/g, "")
  if (written === "") return Ok(undefined)
  return isHitChanceText(written) ? Ok(written) : Err({ type: "not-a-hit-chance" })
}

/** A machine's name as typed, written as every machine's is kept; none typed is empty. */
export const readName = (typed: string): string => keptName(typed)

/** A model name as typed, written as a machine's name is kept; none typed is none. */
export const readModelName = (typed: string): string | undefined => (keptName(typed) === "" ? undefined : keptName(typed))
