/**
 * A seeded run of draws, carried from one draw to the next: the same seed
 * draws the same book. Each draw hands back what it drew and the run as it
 * stands after it (mulberry32, on 32 bits).
 */
export interface Draws {
  readonly state: number
}

export type Drawn<T> = readonly [T, Draws]

const FNV_OFFSET = 0x811c9dc5

const FNV_PRIME = 0x01000193

/** A run of draws from a seed, however it is written. */
export const drawsFrom = (seed: string): Draws => ({
  state: [...seed].reduce((hash, character) => Math.imul(hash ^ (character.codePointAt(0) ?? 0), FNV_PRIME) >>> 0, FNV_OFFSET),
})

/** A number from 0 up to, never reaching, 1. */
const unit = (draws: Draws): Drawn<number> => {
  const state = (draws.state + 0x6d2b79f5) | 0
  const first = Math.imul(state ^ (state >>> 15), state | 1)
  const second = (first + Math.imul(first ^ (first >>> 7), first | 61)) ^ first
  return [((second ^ (second >>> 14)) >>> 0) / 4294967296, { state: state >>> 0 }]
}

/** A number from `low` up to `high`. */
export const between = (draws: Draws, low: number, high: number): Drawn<number> => {
  const [drawn, next] = unit(draws)
  return [low + drawn * (high - low), next]
}

/** A whole number from `low` to `high`, both included. */
export const wholeBetween = (draws: Draws, low: number, high: number): Drawn<number> => {
  const [drawn, next] = unit(draws)
  return [low + Math.min(high - low, Math.floor(drawn * (high - low + 1))), next]
}

/** Whether something that happens one time in so many, by its chance from 0 to 1, happened. */
export const chance = (draws: Draws, likelihood: number): Drawn<boolean> => {
  const [drawn, next] = unit(draws)
  return [drawn < likelihood, next]
}

/** One of the choices, each as likely as its weight; none where there are none, or no weight above nothing. */
export const weighted = <T>(draws: Draws, choices: readonly T[], weightOf: (choice: T) => number): Drawn<T | undefined> => {
  const total = choices.reduce((sum, choice) => sum + weightOf(choice), 0)
  const [drawn, next] = unit(draws)
  const target = drawn * total
  const found = choices.reduce<{
    readonly passed: number
    readonly chosen: T | undefined
  }>(
    (walk, choice) =>
      walk.chosen !== undefined ? walk : walk.passed + weightOf(choice) > target ? { passed: walk.passed, chosen: choice } : { passed: walk.passed + weightOf(choice), chosen: undefined },
    { passed: 0, chosen: undefined },
  )
  return [total > 0 ? (found.chosen ?? choices.at(-1)) : undefined, next]
}

/** A waiting time with this mean, as long or as short as chance makes it (exponential). */
export const exponential = (draws: Draws, mean: number): Drawn<number> => {
  const [drawn, next] = unit(draws)
  return [-mean * Math.log(1 - drawn), next]
}

/** How many tries a win of one in so many tries took, the winning one counted (geometric). */
export const triesToWin = (draws: Draws, oneIn: number): Drawn<number> => {
  const [drawn, next] = unit(draws)
  return [oneIn <= 1 ? 1 : Math.max(1, Math.ceil(Math.log(1 - drawn) / Math.log(1 - 1 / oneIn))), next]
}

/** The choices in an order chance gives them. */
export const shuffled = <T>(draws: Draws, choices: readonly T[]): Drawn<readonly T[]> =>
  choices.reduce<Drawn<readonly T[]>>(
    ([placed, run], choice) => {
      const [at, next] = wholeBetween(run, 0, placed.length)
      return [[...placed.slice(0, at), choice, ...placed.slice(at)], next]
    },
    [[], draws],
  )
