import type { IsoDate } from "../calendar/calendar"
import type { PlayGameKind } from "../play/play"
import type { SharedParlorId } from "./shared"
import { tierOfExchange, tierOfRental, type PlayTerms } from "./terms"

/**
 * The one corner of each game whose rates the app reads from reports, as
 * the published lists name it: the 4-yen pachinko corner and the 20-yen
 * pachislot one, which nearly every parlor has. Other corners vary too much
 * from parlor to parlor for one report to stand for them.
 */
export const REPORTED_TIER: Readonly<Record<PlayGameKind, string>> = { pachinko: "4円", pachislot: "20円" }

const GAMES: readonly PlayGameKind[] = ["pachinko", "pachislot"]

/** The sum a reported rental is stated for, as the published list states it. */
const RENTAL_YEN = 1000

/**
 * A corner's rates as players reported them, each where any report said
 * one that holds: the tokens ¥1,000 rents, and an exchange as tokens for
 * the yen a broker paid for a prize they took.
 */
export interface ReportedRate {
  readonly rentalTokens: number | undefined
  readonly exchange: PlayTerms["exchange"] | undefined
}

/** The reported rates of each listed parlor, for each game where any were reported. */
export type ReportedRates = ReadonlyMap<SharedParlorId, Readonly<Partial<Record<PlayGameKind, ReportedRate>>>>

/**
 * One corner of one parlor as one line of p-lens-parlors' `tiers.jsonl`
 * says it, on the day it was checked: its rental where the line gives one,
 * and the tokens each of its prizes takes, by the prize's name.
 */
export interface TierReport {
  readonly parlor: SharedParlorId
  readonly checked: IsoDate
  readonly game: PlayGameKind
  readonly tier: string
  readonly rental: number | undefined
  readonly prizes: Readonly<Record<string, number>>
}

/**
 * One line of p-lens-brokers' `observations.jsonl` that says what a prize
 * came to: the tokens it took, or the prize by name where it says no
 * tokens, and the yen a broker paid, on the day it was seen.
 */
export interface PrizeObservation {
  readonly parlor: SharedParlorId
  readonly observedOn: IsoDate
  readonly game: PlayGameKind
  readonly tier: string
  readonly prize: string | undefined
  readonly tokens: number | undefined
  readonly yen: number
}

const isCount = (value: number | undefined): value is number => value !== undefined && Number.isInteger(value) && value > 0

/** Reports of the corner the app reads, dated by `on`, put in the order they stand in: by day, and in a day by where they come in the file; none dated after today, a change announced ahead not yet in force. */
const inForce = <T extends { readonly game: PlayGameKind; readonly tier: string }>(reports: readonly T[], on: (report: T) => IsoDate, today: IsoDate): readonly T[] =>
  reports
    .map((report, line) => ({ report, line }))
    .filter(({ report }) => report.tier === REPORTED_TIER[report.game] && on(report) <= today)
    .toSorted((left, right) => on(left.report).localeCompare(on(right.report)) || left.line - right.line)
    .map(({ report }) => report)

const keyOf = (parlor: SharedParlorId, game: PlayGameKind): string => `${game}\u0000${parlor}`

/** The rental last reported for each corner that holds for it: a count of tokens a ¥1,000 at the corner's rate rents. */
const rentalsOf = (tiers: readonly TierReport[]): ReadonlyMap<string, number> =>
  new Map(
    tiers
      .filter((report) => isCount(report.rental) && tierOfRental(report.game, { yen: RENTAL_YEN, tokens: report.rental }) === report.tier)
      .map((report) => [keyOf(report.parlor, report.game), report.rental as number] as const),
  )

const prizeKeyOf = (corner: string, prize: string): string => `${corner}\u0000${prize}`

/** The tokens each prize was last reported to take, by its corner and its name. */
const prizesOf = (tiers: readonly TierReport[]): ReadonlyMap<string, number> =>
  new Map(tiers.flatMap((report) => Object.entries(report.prizes).filter(([, tokens]) => isCount(tokens)).map(([prize, tokens]) => [prizeKeyOf(keyOf(report.parlor, report.game), prize), tokens] as const)))

/** An observation's exchange, its tokens said or found by its prize's name, where it reads and holds for its corner. */
const exchangeOf = (observation: PrizeObservation, prizes: ReadonlyMap<string, number>): PlayTerms["exchange"] | undefined => {
  const tokens = observation.tokens ?? (observation.prize === undefined ? undefined : prizes.get(prizeKeyOf(keyOf(observation.parlor, observation.game), observation.prize)))
  if (!isCount(tokens) || !isCount(observation.yen)) return undefined
  const exchange = { tokens, yen: observation.yen }
  return tierOfExchange(observation.game, exchange) === observation.tier ? exchange : undefined
}

/** The exchange last observed for each corner that holds for it. */
const exchangesOf = (observations: readonly PrizeObservation[], prizes: ReadonlyMap<string, number>): ReadonlyMap<string, PlayTerms["exchange"]> =>
  new Map(observations.flatMap((observation) => ((exchange) => (exchange === undefined ? [] : [[keyOf(observation.parlor, observation.game), exchange] as const]))(exchangeOf(observation, prizes))))

/**
 * What players reported of each parlor's 4-yen and 20-yen corners, folded
 * field by field: the later report of a rental, a prize or an exchange
 * stands over the earlier, whatever else either says, so a line telling
 * the rental alone and one telling the exchange alone both count. A value
 * that does not hold for the corner — a rental or an exchange at another
 * rate, typed into the wrong row — is passed over, and the one before it
 * stands; a wrong one that does hold is put right by the next report.
 */
export const reportedRatesOf = (tiers: readonly TierReport[], observations: readonly PrizeObservation[], today: IsoDate): ReportedRates => {
  const standing = inForce(tiers, (report) => report.checked, today)
  const rentals = rentalsOf(standing)
  const exchanges = exchangesOf(
    inForce(observations, (observation) => observation.observedOn, today),
    prizesOf(standing),
  )
  const rateOf = (parlor: SharedParlorId, game: PlayGameKind): readonly [PlayGameKind, ReportedRate] | undefined => {
    const rate = { rentalTokens: rentals.get(keyOf(parlor, game)), exchange: exchanges.get(keyOf(parlor, game)) }
    return rate.rentalTokens === undefined && rate.exchange === undefined ? undefined : [game, rate]
  }
  const parlors = new Set([...tiers.map((report) => report.parlor), ...observations.map((observation) => observation.parlor)])
  return new Map(
    [...parlors].flatMap((parlor) => {
      const found = GAMES.map((game) => rateOf(parlor, game)).filter((entry) => entry !== undefined)
      return found.length === 0 ? [] : [[parlor, Object.fromEntries(found)] as const]
    }),
  )
}

/** Whether a corner's reports leave anything of its rates unsaid: what the form asks the person to report. */
export const rateUnreported = (rate: ReportedRate | undefined): boolean => rate?.rentalTokens === undefined || rate.exchange === undefined
