import { describe, expect, test } from "bun:test"

import { distanceInMetres, nearestFirst } from "../../src/core/parlor/distance"
import { linkedText, linksFor } from "../../src/core/parlor/linking"
import type { Parlor, SubmissionId } from "../../src/core/parlor/parlor"
import type { SharedParlor, SharedParlorId } from "../../src/core/parlor/shared"
import { UMEDA } from "../support/values"

const listed = (id: string, latitude: number, longitude: number, submissions: readonly string[] = []): SharedParlor => ({
  id: id as SharedParlorId,
  name: id,
  reading: "よみ",
  keywords: [],
  prefecture: "大阪府",
  address: "大阪市中央区難波1-2-3",
  location: { latitude, longitude },
  submissions: submissions as readonly SubmissionId[],
})

const WAITING: Parlor = { identity: { type: "submitted", submission: "sub_01" as SubmissionId }, name: "新店", pools: [{ kind: "ball", tier: "4円" }] }

describe("how far a parlor is", () => {
  test("is measured along the earth: Namba to Umeda is about four kilometres", () => {
    const metres = distanceInMetres({ latitude: 34.6659, longitude: 135.5013 }, { latitude: 34.7025, longitude: 135.4959 })
    expect(metres > 3900 && metres < 4300).toBe(true)
  })

  test("orders parlors nearest first", () => {
    const here = { latitude: 34.6659, longitude: 135.5013 }
    expect(nearestFirst([listed("umeda", 34.7025, 135.4959), listed("namba", 34.666, 135.5015), listed("tokyo", 35.68, 139.76)], here).map((near) => near.parlor.id)).toEqual([
      "namba",
      "umeda",
      "tokyo",
    ] as never)
  })
})

describe("a parlor the list has not placed", () => {
  test("comes after every placed one, with no distance to give", () => {
    const here = { latitude: 34.6659, longitude: 135.5013 }
    const unplaced: SharedParlor = { ...listed("unplaced", 0, 0), location: undefined }
    expect(nearestFirst([unplaced, listed("tokyo", 35.68, 139.76), listed("namba", 34.666, 135.5015)], here).map((near) => [near.parlor.id, near.metres === undefined])).toEqual([
      ["namba", false],
      ["tokyo", false],
      ["unplaced", true],
    ] as never)
  })
})

describe("linking a submission the list has taken", () => {
  test("finds the book's waiting parlors that a listed parlor was made from, and no other", () => {
    expect(linksFor([WAITING, UMEDA], [listed("osm-9", 34.6, 135.5, ["sub_01"])])).toEqual([{ submission: "sub_01", id: "osm-9", name: "新店" }] as never)
    expect(linksFor([WAITING], [listed("osm-9", 34.6, 135.5, ["sub_99"])])).toEqual([])
  })

  test("writes the list's id beside each waiting submission, on declarations and plays alike, and only once", () => {
    const journal = ["account 資産:貯玉:新店:4円  ; parlor-submission: sub_01", "2026-10-04 新店 流星  ; play-id: p, parlor-submission: sub_01, game-kind: pachinko", "account 資産:貯玉:他店:4円  ; parlor-submission: sub_010"].join("\n")
    const link = { submission: "sub_01" as SubmissionId, id: "osm-9" as never, name: "新店" }
    expect(linkedText(journal, [link])).toBe(
      [
        "account 資産:貯玉:新店:4円  ; parlor-submission: sub_01, parlor-id: osm-9",
        "2026-10-04 新店 流星  ; play-id: p, parlor-submission: sub_01, parlor-id: osm-9, game-kind: pachinko",
        "account 資産:貯玉:他店:4円  ; parlor-submission: sub_010",
      ].join("\n"),
    )
  })
})
