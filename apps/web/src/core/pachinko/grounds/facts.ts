import type { AllotmentDto, AnalysisDto, EndingDto, NextDto, NormalizedSpecDto, OutcomeDto, ProbabilityDto, SpecDto, TargetDto } from "@p-lens/contracts/pachinko"

import { prologNumber } from "../../grounds/term"
import type { Figures } from "../figures"
import type { Basis } from "../formula"
import { modesOf, regularOf, type ModeKind, type ModeView } from "../world"

const target = (next: TargetDto): string => (next.type === "end" ? "end" : `state(${next.index})`)

const given = (fact: string): string => `given(${fact}).`

/** Balls an outcome's rounds gain: its own where it says, the machine's payout rule times its rounds where it does not. */
const ballsOf = (outcome: OutcomeDto, normalized: NormalizedSpecDto): number => outcome.balls ?? outcome.rounds * normalized.netBallsPerRound

/** Whether any share of the spec pays its rounds by a prize of its own: then a round has no one payout to state. */
const paysByShare = (normalized: NormalizedSpecDto): boolean => [...normalized.entry, ...normalized.states.flatMap((state) => state.outcomes)].some((outcome) => outcome.balls !== undefined)

/**
 * Each outcome of a first jackpot or a state: its share, rounds, balls,
 * where it leads, the jackpots it is, and the spins it fills the relief
 * gauge by — none for a jackpot, a miss's own where it says them, as a
 * 時短 ended early does, and its state's otherwise.
 */
const outcomeFacts = (from: string, outcomes: readonly OutcomeDto[], normalized: NormalizedSpecDto, stateFills: number): readonly string[] =>
  outcomes.map((outcome) =>
    given(`outcome(${from}, ${prologNumber(outcome.probability)}, ${outcome.rounds}, ${ballsOf(outcome, normalized)}, ${target(outcome.next)}, ${outcome.hits}, ${outcome.hits > 0 ? 0 : (outcome.fills ?? stateFills)})`),
  )

/**
 * The chain the engine solved, as the formula stores it: the regular game,
 * the first jackpot's outcomes and each state's — its share, rounds, balls,
 * where it leads and the jackpots it is, none for a miss — the spins of a
 * state that fill the relief gauge when they run out, the states played
 * without the 電サポ, the spins a state plays at the heso and pays for — so
 * many at most, at its chance — and the 遊タイム.
 */
const chainFacts = (normalized: NormalizedSpecDto): readonly string[] => [
  given(`regular_one_in(${prologNumber(1 / normalized.hitChance)})`),
  ...outcomeFacts("first_hit", normalized.entry, normalized, 0),
  ...normalized.states.flatMap((state, index) => [
    given(`state(${index})`),
    given(`fills(${index}, ${state.fillsGauge ?? 0})`),
    ...(state.withoutSupport === true ? [given(`without_support(${index})`)] : []),
    ...(state.paidSpins === undefined ? [] : [given(`heso(${index}, ${state.paidSpins.spins}, ${prologNumber(state.paidSpins.chance)})`)]),
    ...outcomeFacts(String(index), state.outcomes, normalized, state.fillsGauge ?? 0),
  ]),
  ...(paysByShare(normalized) ? [given("own_payout")] : []),
  ...(normalized.reliefDrive === undefined ? [] : [given(`relief_drive(${normalized.reliefDrive.gauge}, ${target(normalized.reliefDrive.target)})`)]),
]

/** A probability as a spec sheet writes it, as a number. */
const chanceOf = (written: ProbabilityDto): number => (written.type === "ratio" ? (written.numerator * 100) / written.denominatorHundredths : written.basisPoints / 10_000)

/** A mode by its place among the spec's modes: the reasoner is told of modes by number, never by a name someone typed. */
type Places = ReadonlyMap<string, number>

const next = (to: NextDto, places: Places): string => (to.type === "regular" ? "regular" : `mode(${places.get(to.mode) ?? -1})`)

/** Balls a share's jackpot gains: each round by the attacker it opens, the machine's where the share names none. */
const shareBalls = (share: AllotmentDto, payout: SpecDto["resources"]["payout"]): number =>
  [share, ...(share.otherRounds ?? [])].reduce((sum, each) => {
    const count = each.count ?? payout.count
    return sum + each.rounds * ((each.prizeBalls ?? payout.prizeBalls) * count - count)
  }, 0)

const shareRounds = (share: AllotmentDto): number => [share, ...(share.otherRounds ?? [])].reduce((sum, each) => sum + each.rounds, 0)

const shareFacts = (where: string, allotment: readonly AllotmentDto[], spec: SpecDto, places: Places): readonly string[] =>
  allotment.map((share) =>
    given(`spec_share(${where}, ${prologNumber(share.shareBasisPoints / 10_000)}, ${shareRounds(share)}, ${shareBalls(share, spec.resources.payout)}, ${next(share.next, places)}, ${share.jackpots ?? 1})`),
  )

const kindFact = (kind: ModeKind): string => {
  switch (kind.type) {
    case "special-time":
      return `special_time(${kind.spins}, ${prologNumber(chanceOf(kind.chance))})`
    case "rapid":
      return kind.chance === undefined ? `rapid(${kind.spins})` : `rapid_at(${kind.spins}, ${prologNumber(chanceOf(kind.chance))})`
    case "leftover-queue":
      return `leftover_queue(${kind.draws})`
    case "rushing":
      return `rushing(${prologNumber(chanceOf(kind.continuationRate))})`
    case "until-hit":
      return "until_hit"
  }
}

const modeFacts = (mode: ModeView, place: number, spec: SpecDto, places: Places): readonly string[] => [
  given(`spec_mode(${place}, ${kindFact(mode.kind)})`),
  ...shareFacts(`mode(${place})`, mode.allotment, spec, places),
  given(`spec_on_miss(${place}, ${next(mode.onMiss, places)})`),
  ...(mode.luckyTrigger === undefined ? [] : [given(`spec_lucky_trigger(${place}, ${mode.luckyTrigger.atCombo}, ${places.get(mode.luckyTrigger.to) ?? -1})`)]),
  ...(mode.withoutSupport ? [given(`spec_without_support(${place})`)] : []),
  ...(mode.earlyEnd === undefined
    ? []
    : [
        given(`spec_early_end(${place}, ${prologNumber(chanceOf(mode.earlyEnd.chance))})`),
        ...mode.earlyEnd.to.map((share) => given(`spec_early_end_share(${place}, ${prologNumber(share.shareBasisPoints / 10_000)}, ${next(share.next, places)})`)),
      ]),
]

/**
 * The spec as its sheet was written, for the chain to be made from again:
 * the regular game's chance, its allotment and its 遊タイム, each mode's
 * kind, allotment, where a miss goes and its lucky trigger, and which mode
 * and combo each state of the stored chain stands for.
 */
const sheetFacts = (spec: SpecDto, normalized: NormalizedSpecDto): readonly string[] => {
  const regular = regularOf(spec)
  const modes = modesOf(spec)
  const places: Places = new Map(modes.map((mode, place) => [mode.id, place]))
  return [
    ...(regular === undefined ? [] : [given(`spec_regular(${prologNumber(chanceOf(regular.chance))})`), ...shareFacts("regular", regular.allotment, spec, places)]),
    ...(regular?.reliefDrive === undefined ? [] : [given(`spec_relief_drive(${regular.reliefDrive.gauge}, ${places.get(regular.reliefDrive.to) ?? -1})`)]),
    ...modes.flatMap((mode, place) => modeFacts(mode, place, spec, places)),
    ...normalized.origins.map((origin, index) => given(`origin(${index}, ${places.get(origin.mode) ?? -1}, ${origin.combo})`)),
  ]
}

/** A sampled formula's stored 1R トータル確率 and its 95% margin. */
export interface SampledFigure {
  readonly oneIn: number
  readonly margin: number
}

const restartOf = (restart: EndingDto["chances"][number]["restart"]): string => (restart.type === "spent" ? "spent" : `filled(${restart.spins})`)

/** A point of a combo as the engine names it, and its chance of each way of starting again it can come to. */
/**
 * The number a point of a combo is looked up by: its state, whether the
 * 遊タイム's first run is unbroken, and the spins filled, in one integer, so
 * that a long run of thousands of chances is looked up at once rather than
 * searched. The reasoner works the same number out (`point_key`).
 */
const pointKey = (ending: EndingDto): number => (ending.state * 2 + (ending.unbroken ? 1 : 0)) * 100_000 + ending.filled

const endingFacts = (ending: EndingDto): readonly string[] => {
  const key = pointKey(ending)
  return [
    given(`point(${key}, ${ending.state}, ${ending.filled}, ${ending.unbroken ? "unbroken" : "broken"})`),
    ...ending.chances.map((each) => given(`ending(${key}, ${restartOf(each.restart)}, ${prologNumber(each.chance)})`)),
  ]
}

/**
 * What the engine solved of the chain: what each state of the combo yields
 * from there on, in rounds, in balls and in spins paid for at the heso; with a 遊タイム, how often regular
 * play starts again each way over the long run, and from every point of a
 * combo the chance of each; and its two figures.
 */
const solvedFacts = (analysis: AnalysisDto): readonly string[] => [
  ...analysis.derivation.map((state, index) => given(`state_rounds(${index}, ${prologNumber(state.averageRounds)})`)),
  ...analysis.derivation.map((state, index) => given(`state_balls(${index}, ${prologNumber(state.averageBalls)})`)),
  ...analysis.derivation.map((state, index) => given(`state_heso(${index}, ${prologNumber(state.averagePaidSpins)})`)),
  ...(analysis.reliefDrive?.restarts ?? []).map((restart) =>
    given(`restart(${restartOf(restart.restart)}, ${prologNumber(restart.weight)})`),
  ),
  ...(analysis.reliefDrive?.endings ?? []).flatMap(endingFacts),
  given(`engine(round_chance, ${prologNumber(analysis.roundChanceOneIn)})`),
  given(`engine(payout_per_round, ${prologNumber(analysis.ballsPerRound)})`),
]

/**
 * The figures a formula stores, to set what is reasoned against: its 1R
 * 平均出玉, and its 1R トータル確率 — exact, or for a sampled formula an
 * estimate with its margin.
 */
const storedFacts = (figures: Figures, sampled: SampledFigure | undefined): readonly string[] => [
  given(`stored(payout_per_round, ${prologNumber(figures.payoutPerRound)})`),
  sampled === undefined ? given(`stored(round_chance, ${prologNumber(figures.roundChanceOneIn)})`) : given(`sampled(${prologNumber(sampled.oneIn)}, ${prologNumber(sampled.margin)})`),
]

/**
 * What the reasoner is told of a formula, as Prolog facts: the spec as its
 * sheet was written, the chain the engine made of it and solved, how a
 * round pays — the machine's payout rule, a round as measured where it
 * was, and what the balls won on the 電サポ come to as a factor where a
 * support gain changes them — what the engine solved, and the figures the
 * formula stores. Only
 * numbers are written: nothing a person typed reaches the reasoner as text.
 */
export const groundsFacts = (basis: Basis, analysis: AnalysisDto, figures: Figures, sampled: SampledFigure | undefined): string =>
  [
    ...sheetFacts(basis.spec, basis.normalized),
    ...chainFacts(basis.normalized),
    given(`payout(${basis.spec.resources.payout.prizeBalls}, ${basis.spec.resources.payout.count})`),
    ...(basis.conditions.roundPayout.type === "measured" ? [given(`measured(${prologNumber(basis.conditions.roundPayout.balls)})`)] : []),
    ...((points) => (points === undefined || points === 0 ? [] : [given(`support_gain(${prologNumber(1 + points / 10_000)})`)]))(basis.conditions.supportGain?.basisPoints),
    ...solvedFacts(analysis),
    ...storedFacts(figures, sampled),
  ].join("\n")
