import { describe, expect, test } from "bun:test"

import { locateAddress, returnedFrom, submitAddress } from "../../src/ui/features/live/submission-return"

const NOW = "2026-10-04T12:00:00.000Z"

describe("coming back from survey.p-lens.jp", () => {
  test("reads the submission to keep and the game to return to", () => {
    const query = new URLSearchParams({ submission: "sub_01J9XYZ", name: " メガコンドル見滝原店 ", prefecture: "大阪府", game: "pachislot" })
    expect(returnedFrom(query, NOW)).toEqual({
      ok: true,
      value: { type: "submitted", submission: { submission: "sub_01J9XYZ", name: "メガコンドル見滝原店", prefecture: "大阪府", submittedAt: NOW }, from: { type: "start", game: "pachislot" } },
    } as never)
    expect(returnedFrom(new URLSearchParams({ submission: "sub_01J9XYZ", name: "メガコンドル見滝原店", prefecture: "大阪府" }), NOW).ok && "pachinko").toBe("pachinko")
  })

  test("reads the id survey.p-lens.jp files a report under", () => {
    const query = new URLSearchParams({ game: "pachinko", submission: "01a11208-6da3-7519-affc-9829138591c0", name: "AB℃ルグニカ王国本店", prefecture: "大阪府" })
    expect(returnedFrom(query, NOW)).toMatchObject({ ok: true, value: { type: "submitted", submission: { submission: "01a11208-6da3-7519-affc-9829138591c0", name: "AB℃ルグニカ王国本店" } } })
  })

  test("brings nothing but the game when no submission is named", () => {
    expect(returnedFrom(new URLSearchParams({ game: "pachislot" }), NOW)).toEqual({ ok: true, value: { type: "nothing", from: { type: "start", game: "pachislot" } } })
    expect(returnedFrom(new URLSearchParams(), NOW)).toEqual({ ok: true, value: { type: "nothing", from: { type: "start", game: "pachinko" } } })
  })

  test("refuses it whole if any of it is not what it should be", () => {
    const good = { submission: "sub_01J9XYZ", name: "メガコンドル見滝原店", prefecture: "大阪府" }
    for (const bad of [{ submission: "x" }, { submission: "sub 01 <script>" }, { name: "" }, { name: "東京皇国:第8支店" }, { prefecture: "大阪" }, { name: "店".repeat(61) }])
      expect(returnedFrom(new URLSearchParams({ ...good, ...bad }), NOW)).toEqual({ ok: false, error: "unreadable" })
  })
})

describe("leaving for survey.p-lens.jp", () => {
  const SURVEY = "https://survey.test/"
  const APP = "https://app.test"

  test("to submit a parlor, says where to come back to", () => {
    const address = new URL(submitAddress(SURVEY, APP, { type: "start", game: "pachislot" }))
    expect(address.origin + address.pathname).toBe(SURVEY)
    expect(address.searchParams.get("return")).toBe("https://app.test/parlors/submitted?game=pachislot")
  })

  test("to report where a listed parlor is, opens the list searched for its whole name", () => {
    const address = new URL(locateAddress(SURVEY, APP, { type: "start", game: "pachinko" }, { id: "op:yark:1" as never, name: "ワイアーク 大和店" }))
    expect(address.origin + address.pathname).toBe(SURVEY)
    expect(address.searchParams.get("find")).toBe("ワイアーク 大和店")
    expect(new URL(address.searchParams.get("return") ?? "").searchParams.get("located")).toBe("op:yark:1")
  })

  test("coming back from reporting a position brings nothing but the game: the parlor is listed and chosen already", () => {
    const back = new URL(new URL(locateAddress(SURVEY, APP, { type: "start", game: "pachislot" }, { id: "op:yark:1" as never, name: "ワイアーク大和店" })).searchParams.get("return") ?? "")
    back.searchParams.set("submission", "sub_01J9XYZ")
    back.searchParams.set("name", "ワイアーク大和店")
    back.searchParams.set("prefecture", "北海道")
    expect(returnedFrom(back.searchParams, NOW)).toEqual({ ok: true, value: { type: "nothing", from: { type: "start", game: "pachislot" } } })
  })

  test("from a book's play added by hand, comes back to that book's form", () => {
    const from = { type: "entry", game: "pachislot", bookId: "01a11a19-1d86-7b07" } as never
    const back = new URL(new URL(submitAddress(SURVEY, APP, from)).searchParams.get("return") ?? "")
    expect(back.pathname + back.search).toBe("/parlors/submitted?game=pachislot&book=01a11a19-1d86-7b07")
    expect(returnedFrom(back.searchParams, NOW)).toEqual({ ok: true, value: { type: "nothing", from } })
    back.searchParams.set("book", "../../settings")
    expect(returnedFrom(back.searchParams, NOW)).toEqual({ ok: true, value: { type: "nothing", from: { type: "start", game: "pachislot" } } })
  })
})
