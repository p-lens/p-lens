import type { IsoDate } from "../calendar/calendar"
import type { PlayGameKind } from "../play/play"
import type { SharedParlorId } from "./shared"
import { tierOfExchange, tierOfRental, type PlayTerms } from "./terms"

/**
 * The corner of each game whose rates go into the terms as a parlor is
 * chosen, before the person says which corner they play: the 4-yen
 * pachinko corner and the 20-yen pachislot one, which nearly every parlor
 * has. Any other corner's are put in only once the person chooses it.
 */
export const REPORTED_TIER: Readonly<Record<PlayGameKind, string>> = { pachinko: "4円", pachislot: "20円" }

const GAMES: readonly PlayGameKind[] = ["pachinko", "pachislot"]

/** The sum a reported rental is stated for, as the published list states it. */
const RENTAL_YEN = 1000

/**
 * What a corner usually rents for ¥1,000, as a board names the corner by
 * it and as survey.p-lens.jp offers it: ¥1,000 over the rate at pachinko,
 * and at pachislot the 46 medals 20円 rents — the rate turned over less 8% —
 * over the rate. The rate names it, so it is no guess at the parlor; an
 * exchange has nothing like it, and is never put in unless it was seen.
 */
const USUALLY_RENTED_FOR: Readonly<Record<PlayGameKind, number>> = { pachinko: 1000, pachislot: 920 }

/**
 * A corner's rates as players reported them, each where any report said
 * one that holds: the tokens ¥1,000 rents, an exchange as tokens for the
 * yen a broker paid for a prize they took, and a replay's two counts.
 */
export interface ReportedRate {
  readonly rentalTokens: number | undefined
  readonly exchange: PlayTerms["exchange"] | undefined
  readonly replay: PlayTerms["replay"] | undefined
}

/** A parlor's reported corners of one game, by the rate each is named by: `4円`, `1円`. */
export type ReportedCorners = ReadonlyMap<string, ReportedRate>

/** The reported corners of each listed parlor, for each game where any were reported. */
export type ReportedRates = ReadonlyMap<SharedParlorId, Readonly<Partial<Record<PlayGameKind, ReportedCorners>>>>

/**
 * One corner of one parlor as one line of p-lens-parlors' `tiers.jsonl`
 * says it, on the day it was checked: its rental and its replay where the
 * line gives them, and the tokens each of its prizes takes, by the prize's
 * name.
 */
export interface TierReport {
  readonly parlor: SharedParlorId
  readonly checked: IsoDate
  readonly game: PlayGameKind
  readonly tier: string
  readonly rental: number | undefined
  readonly replay: PlayTerms["replay"] | undefined
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

/** Reports dated by `on`, put in the order they stand in: by day, and in a day by where they come in the file; none dated after today, a change announced ahead not yet in force. */
const inForce = <T>(reports: readonly T[], on: (report: T) => IsoDate, today: IsoDate): readonly T[] =>
  reports
    .map((report, line) => ({ report, line }))
    .filter(({ report }) => on(report) <= today)
    .toSorted((left, right) => on(left.report).localeCompare(on(right.report)) || left.line - right.line)
    .map(({ report }) => report)

const cornerKeyOf = (parlor: SharedParlorId, game: PlayGameKind, tier: string): string => `${game}\u0000${tier}\u0000${parlor}`

const prizeKeyOf = (corner: string, prize: string): string => `${corner}\u0000${prize}`

const keyOfReport = (report: { readonly parlor: SharedParlorId; readonly game: PlayGameKind; readonly tier: string }): string => cornerKeyOf(report.parlor, report.game, report.tier)

/** The rental last reported for each corner that holds for it: a count of tokens a ¥1,000 at the corner's rate rents. */
const rentalsOf = (tiers: readonly TierReport[]): ReadonlyMap<string, number> =>
  new Map(tiers.filter((report) => isCount(report.rental) && tierOfRental(report.game, { yen: RENTAL_YEN, tokens: report.rental }) === report.tier).map((report) => [keyOfReport(report), report.rental as number] as const))

/** The replay last reported for each corner, its two counts whole and above zero. */
const replaysOf = (tiers: readonly TierReport[]): ReadonlyMap<string, PlayTerms["replay"]> =>
  new Map(tiers.flatMap((report) => (report.replay !== undefined && isCount(report.replay.paidOut) && isCount(report.replay.deducted) ? [[keyOfReport(report), report.replay] as const] : [])))

/** The tokens each prize was last reported to take, by its corner and its name. */
const prizesOf = (tiers: readonly TierReport[]): ReadonlyMap<string, number> =>
  new Map(tiers.flatMap((report) => Object.entries(report.prizes).filter(([, tokens]) => isCount(tokens)).map(([prize, tokens]) => [prizeKeyOf(keyOfReport(report), prize), tokens] as const)))

/** An observation's exchange, its tokens said or found by its prize's name, where it reads and holds for its corner. */
const exchangeOf = (observation: PrizeObservation, prizes: ReadonlyMap<string, number>): PlayTerms["exchange"] | undefined => {
  const tokens = observation.tokens ?? (observation.prize === undefined ? undefined : prizes.get(prizeKeyOf(keyOfReport(observation), observation.prize)))
  if (!isCount(tokens) || !isCount(observation.yen)) return undefined
  const exchange = { tokens, yen: observation.yen }
  return tierOfExchange(observation.game, exchange) === observation.tier ? exchange : undefined
}

/** The exchange last observed for each corner that holds for it. */
const exchangesOf = (observations: readonly PrizeObservation[], prizes: ReadonlyMap<string, number>): ReadonlyMap<string, PlayTerms["exchange"]> =>
  new Map(observations.flatMap((observation) => ((exchange) => (exchange === undefined ? [] : [[keyOfReport(observation), exchange] as const]))(exchangeOf(observation, prizes))))

/** A rate's number, from the name a corner goes by: 4 for `4円`, 0.5 for `0.5円`. */
const rateOfTier = (tier: string): number => Number(tier.replace(/円$/, ""))

/**
 * What players reported of each parlor's corners, folded field by field:
 * the later report of a rental, a replay, a prize or an exchange stands
 * over the earlier, whatever else either says, so a line telling the
 * rental alone and one telling the exchange alone both count. A rental or
 * an exchange that does not hold for its corner — one at another rate,
 * typed into the wrong row — is passed over, and the one before it stands;
 * a wrong one that does hold is put right by the next report.
 */
export const reportedRatesOf = (tiers: readonly TierReport[], observations: readonly PrizeObservation[], today: IsoDate): ReportedRates => {
  const standing = inForce(tiers, (report) => report.checked, today)
  const rentals = rentalsOf(standing)
  const replays = replaysOf(standing)
  const exchanges = exchangesOf(
    inForce(observations, (observation) => observation.observedOn, today),
    prizesOf(standing),
  )
  const corners = [...new Map([...tiers, ...observations].map((report) => [keyOfReport(report), report] as const)).values()].flatMap(({ parlor, game, tier }) => {
    const key = cornerKeyOf(parlor, game, tier)
    const rate = { rentalTokens: rentals.get(key), exchange: exchanges.get(key), replay: replays.get(key) }
    return rate.rentalTokens === undefined && rate.exchange === undefined && rate.replay === undefined ? [] : [{ parlor, game, tier, rate }]
  })
  const sorted = corners.toSorted((left, right) => left.parlor.localeCompare(right.parlor) || rateOfTier(right.tier) - rateOfTier(left.tier))
  const starts = sorted.flatMap((corner, index) => (index === 0 || sorted[index - 1]?.parlor !== corner.parlor ? [index] : []))
  return new Map(
    starts.map((start, index) => {
      const own = sorted.slice(start, starts[index + 1] ?? sorted.length)
      const byGame = GAMES.flatMap((game) => ((found) => (found.length === 0 ? [] : [[game, new Map(found.map((corner) => [corner.tier, corner.rate] as const))] as const]))(own.filter((corner) => corner.game === game)))
      return [own[0]?.parlor as SharedParlorId, Object.fromEntries(byGame)] as const
    }),
  )
}

/** A parlor's reported corner of a game, where any of it was reported. */
export const reportedRateAt = (rates: ReportedRates, parlor: SharedParlorId, game: PlayGameKind, tier: string): ReportedRate | undefined => rates.get(parlor)?.[game]?.get(tier)

/** The corners of a game a person may choose at a parlor: those a broker was seen to pay for, dearest first. */
export const exchangedCorners = (rates: ReportedRates, parlor: SharedParlorId, game: PlayGameKind): readonly string[] => [...(rates.get(parlor)?.[game] ?? new Map<string, ReportedRate>())].filter(([, rate]) => rate.exchange !== undefined).map(([tier]) => tier)

/** A chosen corner's rental: the one reported, or the one its rate names where none was. */
export const rentalOfCorner = (rate: ReportedRate | undefined, game: PlayGameKind, tier: string): number => rate?.rentalTokens ?? Math.round(USUALLY_RENTED_FOR[game] / rateOfTier(tier))

/** Whether a corner's reports leave its rental or its exchange unsaid: what the form asks the person to report. */
export const rateUnreported = (rate: ReportedRate | undefined): boolean => rate?.rentalTokens === undefined || rate.exchange === undefined
