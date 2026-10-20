import { describe, expect, test } from "bun:test"

import type { BookId } from "../../src/core/book/book"
import type { IsoDate } from "../../src/core/calendar/calendar"
import { huddleCodeOf, huddleNameOf, huddleOn, huddleText, readHuddle, secretOfHuddleCode, type Huddle } from "../../src/core/huddle/huddle"
import { huddlePostOf, huddlePostText, othersLatest, readHuddlePost, type HuddlePost } from "../../src/core/huddle/post"
import type { PachinkoDraft } from "../../src/core/live-play/draft"
import type { PlayTerms } from "../../src/core/parlor/terms"
import type { PlayId } from "../../src/core/play/play"
import { MALEHAN } from "../support/values"

const SECRET = "a".repeat(43)
const DAY = "2026-10-20" as IsoDate
const HUDDLE: Huddle = { secret: SECRET, businessDay: DAY, member: "me", name: "アキラ" }

const TERMS: PlayTerms = { rental: { yen: 1000, tokens: 250 }, exchange: { yen: 1000, tokens: 280 }, replay: { paidOut: 250, deducted: 250 } }

const DRAFT: PachinkoDraft = {
  id: "p-1" as PlayId,
  bookId: "b-1" as BookId,
  date: DAY,
  venue: { type: "parlor", parlor: MALEHAN, terms: TERMS },
  gameKind: "pachinko",
  machine: "made-up",
  pachinko: undefined,
  cabinetNumber: "123",
  startedAt: "2026-10-20T01:00:00.000Z",
  log: '{"spins":0,"outlay":0}\n{"spins":30,"outlay":1000}\n',
  history: [{ at: "2026-10-20T01:10:00.000Z", removed: [], added: ['{"spins":30,"outlay":1000}'] }],
  recorded: { at: "2026-10-20T03:00:10.000Z", finish: { at: "2026-10-20T03:00:00.000Z", counter: 300 } },
}

const post = (member: string, postedAt: string, machine = "made-up"): HuddlePost => ({ member, name: member, postedAt, play: { ...huddlePostOf(DRAFT, HUDDLE, postedAt).play, machine } })

describe("a huddle's code", () => {
  test("carries its secret, marked as a huddle's, and gives it back however it was pasted", () => {
    expect(huddleCodeOf(HUDDLE)).toBe(`p-lens-huddle:1:${SECRET}`)
    expect(secretOfHuddleCode(`  ${huddleCodeOf(HUDDLE)}\n`)).toBe(SECRET)
  })

  test("is never a book's code: a bare secret, an invitation or a short one is none", () => {
    expect(secretOfHuddleCode(SECRET)).toBeUndefined()
    expect(secretOfHuddleCode("plsi.line.token.key")).toBeUndefined()
    expect(secretOfHuddleCode("p-lens-huddle:1:short")).toBeUndefined()
  })
})

describe("a name in a huddle", () => {
  test("is what was typed, its spaces let go and no longer than a card has room for", () => {
    expect(huddleNameOf("  アキラ ")).toBe("アキラ")
    expect(huddleNameOf("あいうえおかきくけこさしすせそ")).toBe("あいうえおかきくけこさし")
    expect(huddleNameOf("   ")).toBeUndefined()
  })
})

describe("the huddle a device is in", () => {
  test("is read back as it was kept, and is none once its business day has turned", () => {
    expect(readHuddle(huddleText(HUDDLE))).toEqual(HUDDLE)
    expect(huddleOn(readHuddle(huddleText(HUDDLE)), DAY)).toEqual(HUDDLE)
    expect(huddleOn(HUDDLE, "2026-10-21" as IsoDate)).toBeUndefined()
  })

  test("is none where what was kept is not one", () => {
    expect(readHuddle(undefined)).toBeUndefined()
    expect(readHuddle("{")).toBeUndefined()
    expect(readHuddle(JSON.stringify({ ...HUDDLE, secret: "short" }))).toBeUndefined()
    expect(readHuddle(JSON.stringify({ ...HUDDLE, businessDay: "someday" }))).toBeUndefined()
  })
})

describe("a play shown to a huddle", () => {
  test("is the play as the device has it, without its book, its marks or its history, under who showed it", () => {
    const shown = huddlePostOf(DRAFT, HUDDLE, "2026-10-20T02:00:00.000Z")
    expect(shown.member).toBe("me")
    expect(shown.name).toBe("アキラ")
    expect(Object.keys(shown.play).toSorted()).toEqual(["cabinetNumber", "date", "gameKind", "id", "log", "machine", "pachinko", "startedAt", "venue"])
    expect(readHuddlePost(huddlePostText(shown))).toEqual(shown)
  })

  test("is none where its text is not one this app reads", () => {
    expect(readHuddlePost("not json")).toBeUndefined()
    expect(readHuddlePost(JSON.stringify({ format: 2, ...post("a", "t") }))).toBeUndefined()
    expect(readHuddlePost(JSON.stringify({ format: 1, ...post("a", "t"), more: 1 }))).toBeUndefined()
    expect(readHuddlePost(JSON.stringify({ format: 1, ...post("a", "t"), play: { id: "p" } }))).toBeUndefined()
  })
})

describe("what the others last showed", () => {
  test("is each one's latest, in the order they first showed anything, this device's own left out", () => {
    const posts = [post("b", "2026-10-20T01:00:00Z"), post("me", "2026-10-20T01:01:00Z"), post("c", "2026-10-20T01:02:00Z"), post("b", "2026-10-20T01:03:00Z", "other")]
    expect(othersLatest(posts, "me").map((shown) => [shown.member, shown.play.machine])).toEqual([
      ["b", "other"],
      ["c", "made-up"],
    ])
  })

  test("keeps the later of two showings that arrived out of order", () => {
    expect(othersLatest([post("b", "2026-10-20T01:03:00Z", "later"), post("b", "2026-10-20T01:00:00Z")], "me").map((shown) => shown.play.machine)).toEqual(["later"])
  })
})
