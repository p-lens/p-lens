import type { AllotmentDto, OtherRoundsDto, SpecDto } from "./engine.ts"

/** Rounds of a bonus through one attacker, said in full: how many, the prize a ball pays and the balls a round takes. */
export interface BonusRounds {
  readonly rounds: number
  readonly prizeBalls: number
  readonly count: number
}

/**
 * A bonus a spec's jackpots pay, told by its rounds alone: two shares of
 * the same rounds through the same attackers are one bonus, whatever their
 * share and wherever they lead — that is what follows the bonus, not the
 * bonus. Two that only happen to pay out the same balls are two. `payout`
 * is the balls it pays out and `spent` the balls shot to get them.
 */
export interface BonusShape {
  /** The rounds as one string, the same for the same bonus: what a name is kept under while it is typed. */
  readonly key: string
  readonly rounds: readonly BonusRounds[]
  readonly payout: number
  readonly spent: number
}

const inFull = (rounds: OtherRoundsDto, payout: SpecDto["resources"]["payout"]): BonusRounds => ({
  rounds: rounds.rounds,
  prizeBalls: rounds.prizeBalls ?? payout.prizeBalls,
  count: rounds.count ?? payout.count,
})

/** Rounds through the same attacker one after another are one run of rounds: 1R and then 9R alike are 10R. */
const joined = (rounds: readonly BonusRounds[]): readonly BonusRounds[] =>
  rounds.reduce<readonly BonusRounds[]>((sofar, each) => {
    const last = sofar.at(-1)
    return last !== undefined && last.prizeBalls === each.prizeBalls && last.count === each.count
      ? [...sofar.slice(0, -1), { ...last, rounds: last.rounds + each.rounds }]
      : [...sofar, each]
  }, [])

const shapeOf = (share: AllotmentDto, payout: SpecDto["resources"]["payout"]): BonusShape => {
  const rounds = joined([share, ...(share.otherRounds ?? [])].map((each) => inFull(each, payout)))
  return {
    key: rounds.map((each) => `${each.rounds}x${each.prizeBalls}x${each.count}`).join("+"),
    rounds,
    payout: rounds.reduce((sum, each) => sum + each.rounds * each.prizeBalls * each.count, 0),
    spent: rounds.reduce((sum, each) => sum + each.rounds * each.count, 0),
  }
}

/**
 * The bonuses a spec's jackpots pay, each once, in the order its entities
 * and their shares first name them: the regular game's, then each mode's.
 */
export const bonusShapesOf = (spec: SpecDto): readonly BonusShape[] => {
  const shares = spec.entities.flatMap((entity) => spec.components.allotment?.[entity] ?? [])
  return shares
    .map((share) => shapeOf(share, spec.resources.payout))
    .filter((shape, index, all) => all.findIndex((other) => other.key === shape.key) === index)
}

/** Every round of a bonus, whichever attacker. */
export const roundsOf = (shape: BonusShape): number => shape.rounds.reduce((sum, each) => sum + each.rounds, 0)
