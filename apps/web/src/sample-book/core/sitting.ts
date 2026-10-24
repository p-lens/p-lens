/**
 * A stretch of play at one machine: the tokens it took from the person's
 * hand before it won, and what it won. The last stretch of a sitting won
 * nothing — it is what was shot before the person left.
 */
export interface Stretch {
  readonly shot: number
  readonly won: number
}

/**
 * Why a person got up from a machine: the day was over, they gave up on
 * it after so much shot with no win, or a run they had won ended and they
 * went to try another.
 */
export type Leaving = "closing" | "gave-up" | "run-over"

/** A sitting at one machine as its game plays it out: what went in and came out, how long it took and what it was worth. */
export interface Sitting {
  readonly stretches: readonly Stretch[]
  readonly minutes: number
  /** In yen, by the machine's formula on the sitting's terms. */
  readonly theoreticalValue: number
  /** The spins ¥1,000 bought, on a game that counts them. */
  readonly spinPerformance: number | undefined
  readonly leaving: Leaving
}

/** What a sitting is played out on: how long there is, the parlor's terms in tokens, and when the person gets up. */
export interface SittingTerms {
  /** Minutes there are to play before the day is over. */
  readonly minutes: number
  /** The tokens ¥1,000 rents. */
  readonly tokensPerThousand: number
  /** Yen a token exchanges for. */
  readonly tokenValue: number
  /** Tokens shot with no win after which the person gives up on the machine; none on the last machine of a day, played until it is over. */
  readonly givingUpAfter: number | undefined
  /** How likely the person is to get up once a run ends, from 0 to 1. */
  readonly leavingAfterRun: number
}
