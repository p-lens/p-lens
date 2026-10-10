import type { AnalysisDto, NormalizedSpecDto, OutcomeDto, TargetDto } from "@p-lens/contracts/pachinko"

import { prologNumber } from "../../grounds/term"
import type { Basis } from "../formula"

const target = (next: TargetDto): string => (next.type === "end" ? "end" : `state(${next.index})`)

const given = (fact: string): string => `given(${fact}).`

/** Balls an outcome's rounds gain: its own where it says, the machine's payout rule times its rounds where it does not. */
const ballsOf = (outcome: OutcomeDto, normalized: NormalizedSpecDto): number => outcome.balls ?? outcome.rounds * normalized.netBallsPerRound

/** Whether any share of the spec pays its rounds by a prize of its own: then a round has no one payout to state. */
const paysByShare = (normalized: NormalizedSpecDto): boolean => [...normalized.entry, ...normalized.states.flatMap((state) => state.outcomes)].some((outcome) => outcome.balls !== undefined)

const specFacts = (normalized: NormalizedSpecDto): readonly string[] => [
  given(`regular_one_in(${prologNumber(1 / normalized.hitChance)})`),
  ...normalized.entry.map((outcome) => given(`entry(${prologNumber(outcome.probability)}, ${outcome.rounds}, ${target(outcome.next)})`)),
  ...normalized.entry.map((outcome) => given(`entry_pays(${prologNumber(outcome.probability)}, ${ballsOf(outcome, normalized)}, ${target(outcome.next)})`)),
  ...(paysByShare(normalized) ? [given("own_payout")] : []),
  ...(normalized.reliefDrive === undefined ? [] : [given(`relief_drive(${normalized.reliefDrive.gauge}, ${target(normalized.reliefDrive.target)})`)]),
]

/** A sampled formula's stored 1R トータル確率 and its 95% margin. */
export interface SampledFigure {
  readonly oneIn: number
  readonly margin: number
}

/**
 * What the reasoner is told of a formula, as Prolog facts: the basis as the
 * engine normalised it — the regular game, the first jackpot's allotment, the
 * 遊タイム and how often regular play starts again each way over the long run —
 * what each state of the combo yields as the engine solved it, in rounds
 * and in balls, how a round pays — or that the shares pay each their own —
 * the engine's own figures to check against, and for a sampled formula, its
 * stored estimate and margin.
 */
export const groundsFacts = (basis: Basis, analysis: AnalysisDto, sampled: SampledFigure | undefined): string =>
  [
    ...specFacts(basis.normalized),
    ...analysis.derivation.map((state, index) => given(`state_rounds(${index}, ${prologNumber(state.averageRounds)})`)),
    ...analysis.derivation.map((state, index) => given(`state_balls(${index}, ${prologNumber(state.averageBalls)})`)),
    given(`payout_scale(${prologNumber(analysis.payoutScale)})`),
    ...(analysis.reliefDrive?.restarts ?? []).map((restart) =>
      given(`restart(${restart.restart.type === "spent" ? "spent" : `filled(${restart.restart.spins})`}, ${prologNumber(restart.weight)})`),
    ),
    basis.conditions.roundPayout.type === "measured"
      ? given(`measured(${prologNumber(basis.conditions.roundPayout.balls)})`)
      : given(`payout(${basis.spec.resources.payout.prizeBalls}, ${basis.spec.resources.payout.count})`),
    given(`engine(round_chance, ${prologNumber(analysis.roundChanceOneIn)})`),
    given(`engine(payout_per_round, ${prologNumber(analysis.ballsPerRound)})`),
    ...(sampled === undefined ? [] : [given(`sampled(${prologNumber(sampled.oneIn)}, ${prologNumber(sampled.margin)})`)]),
  ].join("\n")
