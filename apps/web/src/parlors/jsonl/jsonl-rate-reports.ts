import type { IsoDate } from "../../core/calendar/calendar"
import { reportedRatesOf, type PrizeObservation, type TierReport } from "../../core/parlor/reported-rates"
import type { SharedParlorId } from "../../core/parlor/shared"
import type { PlayGameKind } from "../../core/play/play"
import { Err, Ok, type Result } from "../../core/result/result"
import type { RateReports, RateReportsError } from "../port/rate-reports"

/** What the reports need from outside: where each repository publishes, how to ask, and how long to wait. */
export interface JsonlRateReportsPorts {
  /** Where p-lens-parlors publishes `tiers.jsonl`, ending in a slash. */
  readonly parlorsBase: string
  /** Where p-lens-brokers publishes `observations.jsonl`, ending in a slash; none where the build names none, and no exchange is reported. */
  readonly brokersBase: string | undefined
  readonly request: (url: string, init: RequestInit) => Promise<Response>
  /** How long a file is waited for, in milliseconds, before it is given up. */
  readonly answerWithin: number
}

type Json = Readonly<Record<string, unknown>>

const isJson = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value)

const DAY = /^\d{4}-\d{2}-\d{2}$/

const isDay = (value: unknown): value is IsoDate => typeof value === "string" && DAY.test(value)

const isFilledText = (value: unknown): value is string => typeof value === "string" && value.trim() !== ""

const GAMES: readonly PlayGameKind[] = ["pachinko", "pachislot"]

const gameOf = (value: unknown): PlayGameKind | undefined => GAMES.find((game) => game === value)

const countOf = (value: unknown): number | undefined => (typeof value === "number" ? value : undefined)

const jsonOf = (line: string): unknown => {
  try {
    return JSON.parse(line)
  } catch {
    return undefined
  }
}

const linesOf = (text: string): readonly unknown[] => text.split("\n").filter((line) => line.trim() !== "").map(jsonOf)

/** One corner of one line of `tiers.jsonl`, for each corner it gives. */
const cornersOf = (parlor: SharedParlorId, checked: IsoDate, game: PlayGameKind, corners: unknown): readonly TierReport[] =>
  isJson(corners)
    ? Object.entries(corners).flatMap(([tier, corner]) =>
        isJson(corner)
          ? [{ parlor, checked, game, tier, rental: countOf(corner["rental"]), prizes: isJson(corner["prizes"]) ? Object.fromEntries(Object.entries(corner["prizes"]).flatMap(([prize, tokens]) => (typeof tokens === "number" ? [[prize, tokens]] : []))) : {} }]
          : [],
      )
    : []

/** A line of `tiers.jsonl` as the corners it reports; none where it is not one. */
const tierReportsOf = (line: unknown): readonly TierReport[] => {
  if (!isJson(line) || !isFilledText(line["id"]) || !isDay(line["checked"]) || !isJson(line["tiers"])) return []
  const parlor = line["id"].trim() as SharedParlorId
  const checked = line["checked"]
  const tiers = line["tiers"]
  return GAMES.flatMap((game) => cornersOf(parlor, checked, game, tiers[game]))
}

/** A line of `observations.jsonl` that says what a prize came to; none for one naming a broker alone, or not one at all. */
const prizeObservationOf = (line: unknown): readonly PrizeObservation[] => {
  if (!isJson(line) || !isFilledText(line["parlor"]) || !isDay(line["observedOn"]) || !isFilledText(line["tier"]) || typeof line["yen"] !== "number") return []
  const game = gameOf(line["game"])
  return game === undefined
    ? []
    : [{ parlor: line["parlor"].trim() as SharedParlorId, observedOn: line["observedOn"], game, tier: line["tier"], prize: isFilledText(line["prize"]) ? line["prize"] : undefined, tokens: countOf(line["tokens"]), yen: line["yen"] }]
}

/**
 * The rates players reported, read from p-lens-parlors' `tiers.jsonl` and
 * p-lens-brokers' `observations.jsonl`: a file not published yet is no
 * reports, and one that does not answer, or answers with something not a
 * file of reports, is reports unread — never fewer reports, which would
 * ask the person for rates already given.
 */
export const createJsonlRateReports = (ports: JsonlRateReportsPorts): RateReports => {
  const read = async (base: string, file: string): Promise<Result<readonly unknown[], RateReportsError>> => {
    try {
      const response = await ports.request(`${base}${file}`, { signal: AbortSignal.timeout(ports.answerWithin) })
      if (response.status === 404) return Ok([])
      if (!response.ok) return Err({ type: "unread", file })
      const lines = linesOf(await response.text())
      return lines.length > 0 && lines.every((line) => line === undefined) ? Err({ type: "unread", file }) : Ok(lines)
    } catch {
      return Err({ type: "unread", file })
    }
  }

  const rates: RateReports["rates"] = async (today) => {
    const [tiers, observations] = await Promise.all([read(ports.parlorsBase, "tiers.jsonl"), ports.brokersBase === undefined ? Promise.resolve(Ok([])) : read(ports.brokersBase, "observations.jsonl")])
    if (!tiers.ok) return tiers
    if (!observations.ok) return observations
    return Ok(reportedRatesOf(tiers.value.flatMap(tierReportsOf), observations.value.flatMap(prizeObservationOf), today))
  }

  return { rates }
}
