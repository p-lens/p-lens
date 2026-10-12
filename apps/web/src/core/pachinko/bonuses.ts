import { comparableName, MACHINE_BONUSES } from "@p-lens/contracts"
import { type BonusShape, bonusShapesOf, roundsOf, type SpecDto } from "@p-lens/contracts/pachinko"

import { Err, Ok, type Result } from "../result/result"
import { tidyTyped } from "../text/tidy"
import type { Bonus } from "./formula"

/** The bonuses a spec's jackpots pay, each told by its rounds: what a formula worked out from the spec names, and no more. */
export const bonusShapes = (spec: SpecDto): readonly BonusShape[] => bonusShapesOf(spec)

/**
 * What a bonus goes by until it is named: its rounds, `10R` — and where an
 * earlier bonus of the spec has as many, which of them it is, `10R(2)`.
 */
export const defaultBonusName = (shapes: readonly BonusShape[], index: number): string => {
  const shape = shapes[index]
  if (shape === undefined) return ""
  const earlier = shapes.slice(0, index).filter((other) => roundsOf(other) === roundsOf(shape)).length
  return earlier === 0 ? `${roundsOf(shape)}R` : `${roundsOf(shape)}R(${earlier + 1})`
}

/** What a bonus's name, as typed, is wrong with: longer than the catalog takes, or the name of one above it. */
export type BonusNameProblem = { readonly type: "name-too-long"; readonly index: number; readonly longest: number } | { readonly type: "repeated"; readonly index: number }

/** The name each bonus goes by: as typed under its rounds, or what it goes by until it is named. */
const namesOf = (shapes: readonly BonusShape[], typed: Readonly<Record<string, string>>): readonly string[] =>
  shapes.map((shape, index) => tidyTyped(typed[shape.key] ?? "") || defaultBonusName(shapes, index))

/**
 * A spec's bonuses as a formula states them: each under the name typed
 * for its rounds, or what it goes by until it is named, with the balls its
 * rounds pay out and take, and the jackpots it is won over where they are
 * more than one. No two share a name.
 */
export const namedBonuses = (shapes: readonly BonusShape[], typed: Readonly<Record<string, string>>): Result<readonly Bonus[], readonly BonusNameProblem[]> => {
  const names = namesOf(shapes, typed)
  const problems = names.flatMap((name, index): readonly BonusNameProblem[] => {
    if ([...name].length > MACHINE_BONUSES.nameLength) return [{ type: "name-too-long", index, longest: MACHINE_BONUSES.nameLength }]
    return names.findIndex((other) => comparableName(other) === comparableName(name)) === index ? [] : [{ type: "repeated", index }]
  })
  return problems.length > 0 ? Err(problems) : Ok(shapes.map((shape, index) => ({ name: names[index] ?? "", payout: shape.payout, spent: shape.spent, ...(shape.jackpots === 1 ? {} : { jackpots: shape.jackpots }) })))
}

/** The names a formula gave its basis's bonuses, each under its rounds, so they are typed again as they stood. */
export const bonusNamesOf = (spec: SpecDto, bonuses: readonly Bonus[]): Readonly<Record<string, string>> =>
  Object.fromEntries(bonusShapes(spec).flatMap((shape, index) => (bonuses[index] === undefined ? [] : [[shape.key, bonuses[index].name]])))
