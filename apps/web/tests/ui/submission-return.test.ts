import { describe, expect, test } from "bun:test"

import { locateAddress, returnedFrom, submitAddress } from "../../src/ui/features/live/submission-return"

const NOW = "2026-10-04T12:00:00.000Z"

describe("coming back from survey.p-lens.jp", () => {
  test("reads the submission to keep and the game to return to", () => {
    const query = new URLSearchParams({ submission: "sub_01J9XYZ", name: " ルミナ難波店 ", prefecture: "大阪府", game: "slot" })
    expect(returnedFrom(query, NOW)).toEqual({
      ok: true,
      value: { type: "submitted", submission: { submission: "sub_01J9XYZ", name: "ルミナ難波店", prefecture: "大阪府", submittedAt: NOW }, from: { type: "start", game: "slot" } },
    } as never)
    expect(returnedFrom(new URLSearchParams({ submission: "sub_01J9XYZ", name: "ルミナ難波店", prefecture: "大阪府" }), NOW).ok && "pachinko").toBe("pachinko")
  })

  test("reads the id survey.p-lens.jp files a report under", () => {
    const query = new URLSearchParams({ game: "pachinko", submission: "01a11208-6da3-7519-affc-9829138591c0", name: "ノルテス 喜連瓜破店", prefecture: "大阪府" })
    expect(returnedFrom(query, NOW)).toMatchObject({ ok: true, value: { type: "submitted", submission: { submission: "01a11208-6da3-7519-affc-9829138591c0", name: "ノルテス 喜連瓜破店" } } })
  })

  test("brings nothing but the game when no submission is named", () => {
    expect(returnedFrom(new URLSearchParams({ game: "slot" }), NOW)).toEqual({ ok: true, value: { type: "nothing", from: { type: "start", game: "slot" } } })
    expect(returnedFrom(new URLSearchParams(), NOW)).toEqual({ ok: true, value: { type: "nothing", from: { type: "start", game: "pachinko" } } })
  })

  test("refuses it whole if any of it is not what it should be", () => {
    const good = { submission: "sub_01J9XYZ", name: "ルミナ難波店", prefecture: "大阪府" }
    for (const bad of [{ submission: "x" }, { submission: "sub 01 <script>" }, { name: "" }, { name: "梅田:本店" }, { prefecture: "大阪" }, { name: "店".repeat(61) }])
      expect(returnedFrom(new URLSearchParams({ ...good, ...bad }), NOW)).toEqual({ ok: false, error: "unreadable" })
  })
})

describe("leaving for survey.p-lens.jp", () => {
  const SURVEY = "https://survey.test/"
  const APP = "https://app.test"

  test("to submit a parlor, says where to come back to", () => {
    const address = new URL(submitAddress(SURVEY, APP, { type: "start", game: "slot" }))
    expect(address.origin + address.pathname).toBe(SURVEY)
    expect(address.searchParams.get("return")).toBe("https://app.test/parlors/submitted?game=slot")
  })

  test("to report where a listed parlor is, opens the list searched for its whole name", () => {
    const address = new URL(locateAddress(SURVEY, APP, { type: "start", game: "pachinko" }, { id: "op:eagle:1" as never, name: "イーグル 厚別店" }))
    expect(address.origin + address.pathname).toBe(SURVEY)
    expect(address.searchParams.get("find")).toBe("イーグル 厚別店")
    expect(new URL(address.searchParams.get("return") ?? "").searchParams.get("located")).toBe("op:eagle:1")
  })

  test("coming back from reporting a position brings nothing but the game: the parlor is listed and chosen already", () => {
    const back = new URL(new URL(locateAddress(SURVEY, APP, { type: "start", game: "slot" }, { id: "op:eagle:1" as never, name: "イーグル厚別店" })).searchParams.get("return") ?? "")
    back.searchParams.set("submission", "sub_01J9XYZ")
    back.searchParams.set("name", "イーグル厚別店")
    back.searchParams.set("prefecture", "北海道")
    expect(returnedFrom(back.searchParams, NOW)).toEqual({ ok: true, value: { type: "nothing", from: { type: "start", game: "slot" } } })
  })

  test("from a book's play added by hand, comes back to that book's form", () => {
    const from = { type: "entry", game: "slot", bookId: "01a11a19-1d86-7b07" } as never
    const back = new URL(new URL(submitAddress(SURVEY, APP, from)).searchParams.get("return") ?? "")
    expect(back.pathname + back.search).toBe("/parlors/submitted?game=slot&book=01a11a19-1d86-7b07")
    expect(returnedFrom(back.searchParams, NOW)).toEqual({ ok: true, value: { type: "nothing", from } })
    back.searchParams.set("book", "../../settings")
    expect(returnedFrom(back.searchParams, NOW)).toEqual({ ok: true, value: { type: "nothing", from: { type: "start", game: "slot" } } })
  })
})
