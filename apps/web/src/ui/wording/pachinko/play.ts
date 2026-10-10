import type { RevisionRefusal } from "../../../core/pachinko/revision"
import type { Phase } from "../../../core/play-log/checkpoint"

/** A cabinet's states as a player calls them. */
export const PHASE_NAMES: Readonly<Record<Phase, string>> = { regular: "通常", special: "確変", rapid: "時短" }

/** What a jackpot is called where its machine lists no bonuses to say which it was. */
export const UNTOLD_JACKPOT = "大当り"

/** Balls gained or lost, always signed: `+1,400玉`, `-35玉`. */
export const signedBalls = (balls: number): string => `${balls < 0 ? "-" : "+"}${Math.abs(balls).toLocaleString("ja-JP")}玉`

/** Why a reading cannot be set right or taken away as asked: which reading would then show less on the counter than it must. */
export const describeRevisionRefusal = (refusal: RevisionRefusal): string =>
  `この変更だと、${String(refusal.index + 1)}件目の回転数が ${refusal.expectedAtLeast.toLocaleString("ja-JP")} 回転より小さくなってしまいます。大当りの記録か回転数を見直してください。`
