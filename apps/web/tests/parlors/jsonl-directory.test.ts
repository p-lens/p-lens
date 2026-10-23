import { describe, expect, test } from "bun:test"

import { EMPTY_PARLOR_LIST, type ParlorList } from "../../src/core/parlor/shared"
import { Ok } from "../../src/core/result/result"
import { createJsonlDirectory, parlorsOfJsonl, rejectionsOfJsonl } from "../../src/parlors/jsonl/jsonl-directory"
import type { KeptList, ParlorCache } from "../../src/parlors/port/parlor-cache"

const MEGA_CONDOR_LINE = { id: "osm-1", name: "メガコンドル見滝原店", reading: "めがこんどるみたきはらてん", keywords: ["メガコンドル見滝原"], prefecture: "大阪府", address: "見滝原市1-2-3", lat: 34.665, lon: 135.501, submissions: ["sub_01"] }
const NANKATSU_LINE = { id: "osm-2", name: "ダイナモ南葛店", reading: "だいなもなんかつてん", prefecture: "北海道", address: "南葛市1-2-3", lat: 43.06, lon: 141.35 }

const MEGA_CONDOR = {
  id: "osm-1",
  name: "メガコンドル見滝原店",
  reading: "めがこんどるみたきはらてん",
  keywords: ["メガコンドル見滝原"],
  prefecture: "大阪府",
  address: "見滝原市1-2-3",
  location: { latitude: 34.665, longitude: 135.501 },
  submissions: ["sub_01"],
}
const NANKATSU = {
  id: "osm-2",
  name: "ダイナモ南葛店",
  reading: "だいなもなんかつてん",
  keywords: [],
  prefecture: "北海道",
  address: "南葛市1-2-3",
  location: { latitude: 43.06, longitude: 141.35 },
  submissions: [],
}

const PARLORS = [JSON.stringify(MEGA_CONDOR_LINE), JSON.stringify(NANKATSU_LINE)].join("\n")
const REJECTIONS = JSON.stringify({ submission: "sub_02", reason: "閉店しています" })

const memoryCache = (initial: ParlorList = EMPTY_PARLOR_LIST, version?: string): ParlorCache & { readonly kept: () => ParlorList; readonly version: () => string | undefined } => {
  const held: { kept: KeptList } = { kept: { list: initial, version } }
  return {
    read: async () => Ok(held.kept),
    replace: async (kept) => {
      held.kept = kept
      return Ok(undefined)
    },
    kept: () => held.kept.list,
    version: () => held.kept.version,
  }
}

/** A published list: each file answering as given — a status, its text and, where given, its version — any other not there. A question for a file's version alone is answered without its text. */
const published =
  (files: Readonly<Record<string, readonly [number, string] | readonly [number, string, string]>>) =>
  async (url: string, init?: RequestInit): Promise<Response> => {
    const file = Object.entries(files).find(([name]) => url.endsWith(name))?.[1]
    if (file === undefined) return new Response("", { status: 404 })
    return new Response(init?.method === "HEAD" ? "" : file[1], { status: file[0], ...(file[2] === undefined ? {} : { headers: { ETag: file[2] } }) })
  }

const offline = async (): Promise<Response> => {
  throw new TypeError("Failed to fetch")
}

/** A server that takes the connection and never answers, until the request is given up on. */
const silent = (url: string, init: RequestInit): Promise<Response> =>
  new Promise((_, reject) => init.signal?.addEventListener("abort", () => reject(init.signal?.reason ?? new Error(url))))

const directory = (request: (url: string, init: RequestInit) => Promise<Response>, cache = memoryCache(), now: () => number = () => 0) =>
  createJsonlDirectory({ base: "https://parlors.test/", request, answerWithin: 50, freshFor: 1000, now, cache })

describe("reading the parlor list", () => {
  test("reads one parlor a line, with where it is and the submissions it came from", () => {
    expect(parlorsOfJsonl(`${PARLORS}\n\n`)).toEqual([MEGA_CONDOR, NANKATSU] as never)
  })

  test("passes over a line that is not a parlor — no place, a place outside Japan, a bad name — and keeps the rest", () => {
    const { lat: _lat, ...placeless } = MEGA_CONDOR_LINE
    const lines = ["not json", JSON.stringify(placeless), JSON.stringify({ ...MEGA_CONDOR_LINE, lat: 51.5, lon: -0.1 }), JSON.stringify({ ...MEGA_CONDOR_LINE, name: "東京皇国:第8支店" }), JSON.stringify(NANKATSU_LINE)]
    expect(parlorsOfJsonl(lines.join("\n"))).toEqual([NANKATSU] as never)
  })

  test("reads a line with no position as a parlor the list has not placed yet", () => {
    const { lat: _lat, lon: _lon, ...unplaced } = NANKATSU_LINE
    expect(parlorsOfJsonl(JSON.stringify(unplaced))).toEqual([{ ...NANKATSU, location: undefined }] as never)
  })

  test("keeps a parlor listed twice under one id once, as first listed", () => {
    expect(parlorsOfJsonl([JSON.stringify(MEGA_CONDOR_LINE), JSON.stringify({ ...MEGA_CONDOR_LINE, name: "別の名前店" })].join("\n"))).toEqual([MEGA_CONDOR] as never)
  })

  test("names a parlor by its official name where the list gives one, still found by the list's name", () => {
    const named = (officialName: unknown) => parlorsOfJsonl(JSON.stringify({ ...NANKATSU_LINE, officialName }))
    expect(named("ダイナモ南葛駅前店")).toEqual([{ ...NANKATSU, name: "ダイナモ南葛駅前店", keywords: ["ダイナモ南葛店"] }] as never)
    expect(named("ダイナモ南葛店")).toEqual([NANKATSU] as never)
    expect(named("  ")).toEqual([NANKATSU] as never)
    expect(named("ダイナモ:南葛店")).toEqual([NANKATSU] as never)
  })

  test("reads the rejections, with their reasons where given", () => {
    expect(rejectionsOfJsonl(`${REJECTIONS}\n${JSON.stringify({ submission: "sub_03" })}\n{}`)).toEqual([
      { submission: "sub_02", reason: "閉店しています" },
      { submission: "sub_03", reason: undefined },
    ] as never)
  })
})

describe("the parlor list where it is published", () => {
  test("lists the parlors north to south with the rejections, and keeps both on the device", async () => {
    const cache = memoryCache()
    const read = await directory(published({ "parlors.jsonl": [200, PARLORS], "rejections.jsonl": [200, REJECTIONS] }), cache).list()
    expect(read).toEqual({ ok: true, value: { parlors: [NANKATSU, MEGA_CONDOR], rejections: [{ submission: "sub_02", reason: "閉店しています" }] } } as never)
    expect(cache.kept().parlors.map((parlor) => parlor.id)).toEqual(["osm-1", "osm-2"] as never)
  })

  test("lists the parlors not yet placed with the placed, and does without them where their file is missing or fails", async () => {
    const { lat: _lat, lon: _lon, ...line } = { ...NANKATSU_LINE, id: "op-3", name: "未確認店" }
    const unplaced = { ...NANKATSU, id: "op-3", name: "未確認店", location: undefined }
    const files = { "parlors.jsonl": [200, PARLORS], "rejections.jsonl": [200, ""] } as const
    expect(await directory(published({ ...files, "unplaced.jsonl": [200, JSON.stringify(line)] })).list()).toMatchObject({ ok: true, value: { parlors: [NANKATSU, unplaced, MEGA_CONDOR] } })
    expect(await directory(published({ ...files, "unplaced.jsonl": [500, ""] })).list()).toMatchObject({ ok: true, value: { parlors: [NANKATSU, MEGA_CONDOR] } })
  })

  test("takes no rejections file as none yet", async () => {
    expect(await directory(published({ "parlors.jsonl": [200, PARLORS] })).list()).toEqual({ ok: true, value: { parlors: [NANKATSU, MEGA_CONDOR], rejections: [] } } as never)
  })

  test("with no network, no answer in time, or a list not published, lists the device's copy", async () => {
    const kept: ParlorList = { parlors: [MEGA_CONDOR as never], rejections: [] }
    for (const request of [offline, silent, published({})]) expect(await directory(request, memoryCache(kept)).list()).toEqual({ ok: true, value: kept } as never)
  })

  test("with nothing kept either, says why the list could not be read", async () => {
    expect(await directory(offline).list()).toEqual({ ok: false, error: { type: "unavailable", detail: "TypeError: Failed to fetch" } })
    expect(await directory(published({})).list()).toEqual({ ok: false, error: { type: "unavailable", detail: "parlors.jsonl is not published" } })
    expect(await directory(published({ "parlors.jsonl": [500, ""] })).list()).toEqual({ ok: false, error: { type: "unavailable", detail: "parlors.jsonl answered 500" } })
  })

  test("lists the device's copy at once where it has one, and reads the published list behind it for the next asking", async () => {
    const cache = memoryCache({ parlors: [MEGA_CONDOR as never], rejections: [] })
    const asked: string[] = []
    const answering = published({ "parlors.jsonl": [200, PARLORS], "rejections.jsonl": [200, ""] })
    const listed = directory(async (url, init) => {
      asked.push(url)
      return answering(url, init)
    }, cache)
    expect(await listed.list()).toMatchObject({ ok: true, value: { parlors: [MEGA_CONDOR] } })
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(asked.length).toBe(3)
    expect(await listed.list()).toMatchObject({ ok: true, value: { parlors: [NANKATSU, MEGA_CONDOR] } })
    expect(cache.kept().parlors.length).toBe(2)
  })

  test("does not wait on a network that never answers once it has a copy, nor read again while a reading stands", async () => {
    const waiting = directory(silent, memoryCache({ parlors: [MEGA_CONDOR as never], rejections: [] }))
    expect(await Promise.race([waiting.list(), new Promise((resolve) => setTimeout(() => resolve("waited"), 20))])).toMatchObject({ ok: true })

    const clock = { now: 0 }
    const asked: string[] = []
    const answering = published({ "parlors.jsonl": [200, PARLORS], "rejections.jsonl": [200, ""] })
    const listed = directory(async (url, init) => {
      asked.push(url)
      return answering(url, init)
    }, memoryCache(), () => clock.now)
    await listed.list()
    clock.now = 999
    await listed.list()
    expect(asked.length).toBe(3)
    clock.now = 1000
    await listed.list()
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(asked.length).toBe(6)
  })

  test("asks only for the published files' versions, and reads the files where one has moved", async () => {
    const clock = { now: 0 }
    const asked: string[] = []
    const files: { now: Parameters<typeof published>[0] } = { now: { "parlors.jsonl": [200, JSON.stringify(MEGA_CONDOR_LINE), "p1"], "unplaced.jsonl": [200, "", "u1"], "rejections.jsonl": [200, "", "r1"] } }
    const cache = memoryCache()
    const listed = directory(
      async (url, init) => {
        asked.push(`${init?.method ?? "GET"} ${url.split("/").at(-1) ?? ""}`)
        return published(files.now)(url, init)
      },
      cache,
      () => clock.now,
    )
    const settle = () => new Promise((resolve) => setTimeout(resolve, 10))

    expect(await listed.list()).toMatchObject({ ok: true, value: { parlors: [MEGA_CONDOR] } })
    expect(cache.version()).toBe("p1 u1 r1")

    clock.now = 1000
    await listed.list()
    await settle()
    expect(asked.slice(3)).toEqual(["HEAD parlors.jsonl", "HEAD unplaced.jsonl", "HEAD rejections.jsonl"])

    files.now = { ...files.now, "parlors.jsonl": [200, PARLORS, "p2"] }
    clock.now = 2000
    await listed.list()
    await settle()
    expect(asked.slice(6)).toEqual(["HEAD parlors.jsonl", "HEAD unplaced.jsonl", "HEAD rejections.jsonl", "GET parlors.jsonl", "GET unplaced.jsonl", "GET rejections.jsonl"])
    expect(await listed.list()).toMatchObject({ ok: true, value: { parlors: [NANKATSU, MEGA_CONDOR] } })
    expect(cache.version()).toBe("p2 u1 r1")
  })

  test("reads the files whole each time where the publisher tells no versions", async () => {
    const clock = { now: 0 }
    const asked: string[] = []
    const answering = published({ "parlors.jsonl": [200, PARLORS], "rejections.jsonl": [200, ""] })
    const listed = directory(
      async (url, init) => {
        asked.push(init?.method ?? "GET")
        return answering(url, init)
      },
      memoryCache(),
      () => clock.now,
    )
    await listed.list()
    clock.now = 1000
    await listed.list()
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(asked).toEqual(["GET", "GET", "GET", "GET", "GET", "GET"])
  })
})
