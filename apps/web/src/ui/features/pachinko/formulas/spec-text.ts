import type { NextDto, ConditionsDto, OtherRoundsDto, ProbabilityDto } from "@p-lens/contracts/pachinko"

import type { ModeKind, ModeView } from "../../../../core/pachinko/world"

/** Hundredths as a plain decimal, without trailing zeros: `31970` is `319.7`. */
const hundredths = (value: number): string => (value / 100).toFixed(2).replace(/\.?0+$/, "")

/** A probability as the spec sheet wrote it: `1/319.7`, or `81%`. */
export const probabilityText = (probability: ProbabilityDto): string =>
  probability.type === "ratio"
    ? `${probability.numerator}/${hundredths(probability.denominatorHundredths)}`
    : `${hundredths(probability.basisPoints)}%`

/** Several probabilities side by side, as a row lists them: `1/49.91・1/77.74`; none where there are none. */
export const probabilitiesText = (probabilities: readonly ProbabilityDto[]): string | undefined => (probabilities.length === 0 ? undefined : probabilities.map(probabilityText).join("・"))

export const shareText = (basisPoints: number): string => `${hundredths(basisPoints)}%`

/** Where play goes, named by the mode's label rather than its id. */
export const nextText = (next: NextDto, modes: readonly ModeView[]): string =>
  next.type === "regular" ? "通常" : (modes.find((mode) => mode.id === next.mode)?.label ?? next.mode)

/** The attacker some rounds open, where it is not the machine's: its prize, its count, or both; nothing where it is. */
export const ownAttackerText = (rounds: OtherRoundsDto): string | undefined => {
  const parts = [...(rounds.prizeBalls === undefined ? [] : [`賞球${rounds.prizeBalls}個`]), ...(rounds.count === undefined ? [] : [`${rounds.count}C`])]
  return parts.length === 0 ? undefined : parts.join("×")
}

export const kindText = (kind: ModeKind): string => {
  switch (kind.type) {
    case "special-time":
      return `ST ${kind.spins}回転・${probabilityText(kind.chance)}`
    case "rapid":
      return `時短 ${kind.spins}回転`
    case "leftover-queue":
      return `残保留 ${kind.draws}個`
    case "rushing":
      return `継続率 ${probabilityText(kind.continuationRate)}`
    case "until-hit":
      return "次回大当りまで"
  }
}

export const roundPayoutText = (conditions: ConditionsDto, specNet: number): string =>
  conditions.roundPayout.type === "from-spec" ? `スペック通り（1R ${specNet}個）` : `実測 1R ${conditions.roundPayout.balls}個`
