import { describe, expect, test } from "bun:test"

import type { BookId } from "../../src/core/book/book"
import type { IsoDate } from "../../src/core/calendar/calendar"
import { huddleCodeOf, huddleNameOf, huddleOn, huddleText, readHuddle, secretOfHuddleCode, type Huddle } from "../../src/core/huddle/huddle"
import { huddlePostOf, huddlePostText, othersPlays, readHuddlePost, type HuddlePost } from "../../src/core/huddle/post"
import { anyInJackpot, huddleStandingOf } from "../../src/core/huddle/standing"
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

const post = (member: string, postedAt: string, machine = "made-up", playId = "p-1"): HuddlePost => ({ member, name: member, postedAt, play: { ...huddlePostOf(DRAFT, HUDDLE, postedAt).play, id: playId as PlayId, machine } })

const withLog = (log: string, gameKind: "pachinko" | "slot" = "pachinko"): HuddlePost["play"] => ({ ...huddlePostOf(DRAFT, HUDDLE, DAY).play, log, gameKind }) as HuddlePost["play"]

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

describe("the others' plays", () => {
  test("are each play's latest showing, the others in the order they first showed anything, this device's own left out", () => {
    const posts = [post("b", "2026-10-20T01:00:00Z"), post("me", "2026-10-20T01:01:00Z"), post("c", "2026-10-20T01:02:00Z"), post("b", "2026-10-20T01:03:00Z", "same play later")]
    expect(othersPlays(posts, "me").map(({ post: shown, latest }) => [shown.member, shown.play.machine, latest])).toEqual([
      ["b", "same play later", true],
      ["c", "made-up", true],
    ])
  })

  test("keep a play left for another machine, the one moved to the latest and first", () => {
    const posts = [post("b", "2026-10-20T01:00:00Z", "left"), post("b", "2026-10-20T02:00:00Z", "moved to", "p-2")]
    expect(othersPlays(posts, "me").map(({ post: shown, latest }) => [shown.play.machine, latest])).toEqual([
      ["moved to", true],
      ["left", false],
    ])
  })

  test("keep the later of two showings of a play that arrived out of order", () => {
    expect(othersPlays([post("b", "2026-10-20T01:03:00Z", "later"), post("b", "2026-10-20T01:00:00Z")], "me").map(({ post: shown }) => shown.play.machine)).toEqual(["later"])
  })
})

describe("where one of the others' plays stands", () => {
  test("is a jackpot where its last reading won one, and 時短 where a pachinko play's last reading ran in it", () => {
    expect(huddleStandingOf(withLog('{"spins":0,"outlay":0}\n{"spins":120,"outlay":3000,"event":{"kind":"jackpot"}}\n'))).toBe("jackpot")
    expect(huddleStandingOf(withLog('{"spins":0,"outlay":0}\n{"spins":120,"outlay":3000,"event":{"kind":"jackpot"}}\n{"spins":220,"outlay":3000,"phase":"rapid"}\n'))).toBe("rapid")
    expect(huddleStandingOf(withLog('{"spins":0,"outlay":0}\n{"spins":30,"outlay":1000}\n'))).toBe("playing")
  })

  test("is over once its log says so, whatever came before", () => {
    expect(huddleStandingOf(withLog('{"spins":0,"outlay":0}\n{"spins":120,"outlay":3000,"event":{"kind":"jackpot"}}\n{"spins":120,"outlay":3000,"event":{"kind":"finished"}}\n'))).toBe("finished")
  })

  test("says nothing of 確変, nor of 時短 on a pachislot play", () => {
    expect(huddleStandingOf(withLog('{"spins":0,"outlay":0}\n{"spins":80,"outlay":1000,"phase":"special"}\n'))).toBe("playing")
    expect(huddleStandingOf(withLog('{"spins":0,"outlay":0}\n{"spins":80,"outlay":1000,"phase":"rapid"}\n', "slot"))).toBe("playing")
  })
})

describe("whether any of the others is in a jackpot", () => {
  const JACKPOT = '{"spins":0,"outlay":0}\n{"spins":120,"outlay":3000,"event":{"kind":"jackpot"}}\n'
  const shown = (log: string, latest: boolean) => ({ post: { ...post("b", "2026-10-20T01:00:00Z"), play: withLog(log) }, latest })

  test("is so where one is, on the play they are on", () => {
    expect(anyInJackpot([shown('{"spins":0,"outlay":0}\n', true), shown(JACKPOT, true)])).toBe(true)
  })

  test("is not so for a play left behind in one, nor with nobody", () => {
    expect(anyInJackpot([shown(JACKPOT, false)])).toBe(false)
    expect(anyInJackpot([])).toBe(false)
  })
})
