import type { IsoDate } from "../../core/calendar/calendar"
import { reportedRatesOf, type PrizeObservation, type ReportedRates, type TierReport } from "../../core/parlor/reported-rates"
import type { SharedParlorId } from "../../core/parlor/shared"
import type { PlayGameKind } from "../../core/play/play"
import { Err, Ok, type Result } from "../../core/result/result"
import type { RateReports, RateReportsError } from "../port/rate-reports"
import type { KeptFile, KeptReports, RateReportsCache } from "../port/rate-reports-cache"

/** What the reports need from outside: where each repository publishes, how to ask, and how long to wait. */
export interface JsonlRateReportsPorts {
  /** Where p-lens-parlors publishes `tiers.jsonl`, ending in a slash. */
  readonly parlorsBase: string
  /** Where p-lens-brokers publishes `observations.jsonl`, ending in a slash; none where the build names none, and no exchange is reported. */
  readonly brokersBase: string | undefined
  readonly request: (url: string, init: RequestInit) => Promise<Response>
  /** How long a file is waited for, in milliseconds, before it is given up. */
  readonly answerWithin: number
  /** How long a look at the published files stands, in milliseconds, before they are looked at again behind the device's copy. */
  readonly freshFor: number
  /** The moment, in milliseconds, for telling how old a look is. */
  readonly now: () => number
  readonly cache: RateReportsCache
}

type Json = Readonly<Record<string, unknown>>

const isJson = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value)

const DAY = /^\d{4}-\d{2}-\d{2}$/

const isDay = (value: unknown): value is IsoDate => typeof value === "string" && DAY.test(value)

const isFilledText = (value: unknown): value is string => typeof value === "string" && value.trim() !== ""

const GAMES: readonly PlayGameKind[] = ["pachinko", "pachislot"]

const gameOf = (value: unknown): PlayGameKind | undefined => GAMES.find((game) => game === value)

const countOf = (value: unknown): number | undefined => (typeof value === "number" ? value : undefined)

/** A corner's replay as the list writes it, where both its counts are numbers. */
const replayOf = (value: unknown): { readonly paidOut: number; readonly deducted: number } | undefined => {
  if (!isJson(value)) return undefined
  const [paidOut, deducted] = [countOf(value["paidOut"]), countOf(value["deducted"])]
  return paidOut === undefined || deducted === undefined ? undefined : { paidOut, deducted }
}

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
          ? [{ parlor, checked, game, tier, rental: countOf(corner["rental"]), replay: replayOf(corner["replay"]), prizes: isJson(corner["prizes"]) ? Object.fromEntries(Object.entries(corner["prizes"]).flatMap(([prize, tokens]) => (typeof tokens === "number" ? [[prize, tokens]] : []))) : {} }]
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

/** What a file not published, or not named by the build, is kept as. */
const UNPUBLISHED: KeptFile = { text: "", version: "-" }

/** Whether text that came as a file of reports holds none while it holds something: a page a hall's network or a gateway put in its place, which must never take the copy kept. */
const isNotReports = (text: string): boolean => {
  const lines = linesOf(text)
  return lines.length > 0 && lines.every((line) => line === undefined)
}

/** Whether a copy's files carry the versions the published ones have now; a copy or a publisher that tells none is read whole. */
const sameVersions = (kept: KeptReports, now: readonly (string | undefined)[]): boolean =>
  [kept.tiers.version, kept.observations.version].every((version, index) => version !== undefined && version === now[index])

/** The rates a copy of the reports comes to on a day. */
const ratesOf = (kept: KeptReports, today: IsoDate): ReportedRates => reportedRatesOf(linesOf(kept.tiers.text).flatMap(tierReportsOf), linesOf(kept.observations.text).flatMap(prizeObservationOf), today)

/**
 * The rates players reported, read from p-lens-parlors' `tiers.jsonl` and
 * p-lens-brokers' `observations.jsonl`, as the parlor list is: the copy
 * last read is kept on the device, and once there is one it is what rates
 * are filled in from, at once and offline as well. The published files are
 * looked at behind it no more often than `freshFor` — their versions alone,
 * and the files read only where a version has moved — and what that brings
 * is filled in from the next asking on. Only a device with no copy waits
 * for the network: a file not published yet is no reports, and one that
 * does not answer, or answers with something not a file of reports, is
 * reports unread — never fewer reports, which would ask the person for
 * rates already given.
 */
export const createJsonlRateReports = (ports: JsonlRateReportsPorts): RateReports => {
  const held: {
    kept: KeptReports | undefined
    lookedAt: number | undefined
    looking: Promise<Result<KeptReports, RateReportsError>> | undefined
    folded: { readonly kept: KeptReports; readonly today: IsoDate; readonly rates: ReportedRates } | undefined
  } = { kept: undefined, lookedAt: undefined, looking: undefined, folded: undefined }

  const asked = async (base: string | undefined, file: string, method: "GET" | "HEAD"): Promise<Result<KeptFile, RateReportsError>> => {
    if (base === undefined) return Ok(UNPUBLISHED)
    try {
      const response = await ports.request(`${base}${file}`, { method, signal: AbortSignal.timeout(ports.answerWithin) })
      if (response.status === 404) return Ok(UNPUBLISHED)
      if (!response.ok) return Err({ type: "unread", file })
      const text = method === "HEAD" ? "" : await response.text()
      return isNotReports(text) ? Err({ type: "unread", file }) : Ok({ text, version: response.headers.get("ETag") ?? undefined })
    } catch {
      return Err({ type: "unread", file })
    }
  }

  const both = (method: "GET" | "HEAD"): Promise<readonly [Result<KeptFile, RateReportsError>, Result<KeptFile, RateReportsError>]> =>
    Promise.all([asked(ports.parlorsBase, "tiers.jsonl", method), asked(ports.brokersBase, "observations.jsonl", method)])

  /** The published files read whole and kept. */
  const read = async (): Promise<Result<KeptReports, RateReportsError>> => {
    const [tiers, observations] = await both("GET")
    if (!tiers.ok) return tiers
    if (!observations.ok) return observations
    const kept = { tiers: tiers.value, observations: observations.value }
    await ports.cache.replace(kept)
    held.kept = kept
    held.lookedAt = ports.now()
    return Ok(kept)
  }

  /** The published files looked at: left as they are where neither version has moved from the copy's, read whole where one has. */
  const looked = async (): Promise<Result<KeptReports, RateReportsError>> => {
    const copy = held.kept
    if (copy === undefined) return read()
    const [tiers, observations] = await both("HEAD")
    if (!tiers.ok || !observations.ok || !sameVersions(copy, [tiers.value.version, observations.value.version])) return read()
    held.lookedAt = ports.now()
    return Ok(copy)
  }

  /** One look at the published files at a time: whoever asks while one runs is given that one. */
  const looking = (): Promise<Result<KeptReports, RateReportsError>> => {
    const running = held.looking ?? looked().finally(() => (held.looking = undefined))
    held.looking = running
    return running
  }

  /** The device's copy, read once and held; none where it has none yet. */
  const kept = async (): Promise<KeptReports | undefined> => {
    if (held.kept !== undefined) return held.kept
    const stored = await ports.cache.read()
    held.kept = stored.ok ? stored.value : undefined
    return held.kept
  }

  const stale = (): boolean => held.lookedAt === undefined || ports.now() - held.lookedAt >= ports.freshFor

  /** The rates a copy comes to on a day, worked out once for each copy and day. */
  const folded = (copy: KeptReports, today: IsoDate): ReportedRates => {
    if (held.folded?.kept === copy && held.folded.today === today) return held.folded.rates
    const rates = ratesOf(copy, today)
    held.folded = { kept: copy, today, rates }
    return rates
  }

  const rates: RateReports["rates"] = async (today) => {
    const copy = await kept()
    if (copy === undefined) {
      const fresh = await looking()
      return fresh.ok ? Ok(folded(fresh.value, today)) : fresh
    }
    if (stale()) void looking()
    return Ok(folded(copy, today))
  }

  return { rates }
}
