import { describe, expect, test } from "bun:test"

import type { IsoDate } from "../../src/core/calendar/calendar"
import type { SharedParlorId } from "../../src/core/parlor/shared"
import { Ok } from "../../src/core/result/result"
import { createJsonlRateReports } from "../../src/parlors/jsonl/jsonl-rate-reports"
import type { KeptReports, RateReportsCache } from "../../src/parlors/port/rate-reports-cache"

const TODAY = "2026-11-13" as IsoDate
const PARLOR = "osm-1" as SharedParlorId
const FRESH_FOR = 1000

const TIERS = JSON.stringify({ id: "osm-1", tiers: { pachinko: { "4円": { rental: 250, prizes: { 小: 140 } } } }, checked: "2026-10-01" })
const OBSERVATIONS = JSON.stringify({ parlor: "osm-1", observedOn: "2026-10-01", game: "pachinko", tier: "4円", prize: "小", tokens: 140, yen: 500 })
const LATER_TIERS = `${TIERS}\n${JSON.stringify({ id: "osm-1", tiers: { pachinko: { "4円": { rental: 240 } } }, checked: "2026-10-05" })}`

const memoryCache = (initial?: KeptReports): RateReportsCache & { readonly kept: () => KeptReports | undefined } => {
  const held: { kept: KeptReports | undefined } = { kept: initial }
  return {
    read: async () => Ok(held.kept),
    replace: async (kept) => {
      held.kept = kept
      return Ok(undefined)
    },
    kept: () => held.kept,
  }
}

/** The published files, each answering as given with its version; asked for its version alone, without its text. Every question is counted. */
const published = (files: Readonly<Record<string, readonly [string, string]>>) => {
  const asked: string[] = []
  const request = async (url: string, init?: RequestInit): Promise<Response> => {
    asked.push(`${init?.method ?? "GET"} ${url}`)
    const file = Object.entries(files).find(([name]) => url.endsWith(name))?.[1]
    return file === undefined ? new Response("", { status: 404 }) : new Response(init?.method === "HEAD" ? "" : file[0], { headers: { ETag: file[1] } })
  }
  return { request, asked }
}

const offline = async (): Promise<Response> => {
  throw new TypeError("Failed to fetch")
}

const settled = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

const reportsOver = (request: (url: string, init?: RequestInit) => Promise<Response>, cache: RateReportsCache, now: () => number = () => 0) =>
  createJsonlRateReports({ parlorsBase: "https://parlors.test/", brokersBase: "https://brokers.test/", request, answerWithin: 1000, freshFor: FRESH_FOR, now, cache })

describe("the rates players reported, read as the parlor list is", () => {
  test("a device with no copy reads both files, keeps them, and fills in from them", async () => {
    const cache = memoryCache()
    const rates = await reportsOver(published({ "tiers.jsonl": [TIERS, '"t1"'], "observations.jsonl": [OBSERVATIONS, '"o1"'] }).request, cache).rates(TODAY)
    expect(rates.ok && rates.value.get(PARLOR)?.pachinko?.get("4円")).toEqual({ rentalTokens: 250, exchange: { tokens: 140, yen: 500 }, replay: undefined })
    expect(cache.kept()).toEqual({ tiers: { text: TIERS, version: '"t1"' }, observations: { text: OBSERVATIONS, version: '"o1"' } })
  })

  test("offline, the copy kept fills the rates in", async () => {
    const cache = memoryCache({ tiers: { text: TIERS, version: '"t1"' }, observations: { text: OBSERVATIONS, version: '"o1"' } })
    const rates = await reportsOver(offline, cache).rates(TODAY)
    expect(rates.ok && rates.value.get(PARLOR)?.pachinko?.get("4円")?.rentalTokens).toBe(250)
  })

  test("offline with no copy, the reports are unread, never none", async () => {
    expect(await reportsOver(offline, memoryCache()).rates(TODAY)).toMatchObject({ ok: false, error: { type: "unread" } })
  })

  test("the copy is filled in from at once, and a file whose version moved is read behind it for the next asking", async () => {
    const cache = memoryCache({ tiers: { text: TIERS, version: '"t1"' }, observations: { text: OBSERVATIONS, version: '"o1"' } })
    const files = published({ "tiers.jsonl": [LATER_TIERS, '"t2"'], "observations.jsonl": [OBSERVATIONS, '"o1"'] })
    const reports = reportsOver(files.request, cache)
    const first = await reports.rates(TODAY)
    expect(first.ok && first.value.get(PARLOR)?.pachinko?.get("4円")?.rentalTokens).toBe(250)
    await settled()
    await settled()
    const next = await reports.rates(TODAY)
    expect(next.ok && next.value.get(PARLOR)?.pachinko?.get("4円")?.rentalTokens).toBe(240)
    expect(cache.kept()?.tiers.version).toBe('"t2"')
  })

  test("where no version has moved, only the versions are asked for, and not again while the look stands", async () => {
    const cache = memoryCache({ tiers: { text: TIERS, version: '"t1"' }, observations: { text: OBSERVATIONS, version: '"o1"' } })
    const files = published({ "tiers.jsonl": [TIERS, '"t1"'], "observations.jsonl": [OBSERVATIONS, '"o1"'] })
    const reports = reportsOver(files.request, cache)
    await reports.rates(TODAY)
    await settled()
    await reports.rates(TODAY)
    await settled()
    expect(files.asked).toEqual(["HEAD https://parlors.test/tiers.jsonl", "HEAD https://brokers.test/observations.jsonl"])
  })

  test("a page put in a file's place never takes the copy's", async () => {
    const cache = memoryCache()
    const rates = await reportsOver(published({ "tiers.jsonl": ["<html>login</html>", '"x"'], "observations.jsonl": [OBSERVATIONS, '"o1"'] }).request, cache).rates(TODAY)
    expect(rates).toMatchObject({ ok: false, error: { type: "unread", file: "tiers.jsonl" } })
    expect(cache.kept()).toBeUndefined()
  })
})
