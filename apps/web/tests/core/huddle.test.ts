import { describe, expect, test } from "bun:test"

import type { BookId } from "../../src/core/book/book"
import type { IsoDate } from "../../src/core/calendar/calendar"
import { huddleCodeOf, huddleInOn, huddleNameOf, huddleOn, huddleText, readHuddle, secretOfHuddleCode, type Huddle } from "../../src/core/huddle/huddle"
import { givenUp, huddleDepartureOf, latestEntries, huddleEntryText, huddlePostOf, huddleWithdrawalOf, listedFor, othersPlays, readHuddleEntry, type HuddlePost } from "../../src/core/huddle/post"
import { huddleStandingOf, huddleTurnOf, jackpotStreakOf, jackpotsNow, louderTurn } from "../../src/core/huddle/standing"
import type { PachinkoDraft } from "../../src/core/live-play/draft"
import type { PlayTerms } from "../../src/core/parlor/terms"
import type { PlayId } from "../../src/core/play/play"
import { MALEHAN } from "../support/values"

const SECRET = "a".repeat(43)
const DAY = "2026-10-20" as IsoDate
const HUDDLE: Huddle = { secret: SECRET, businessDay: DAY, member: "me", name: "アキラ", dismissed: [] }

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

/** A play shown, begun when it was first shown unless said otherwise: what the list is put in order by. */
const post = (member: string, postedAt: string, machine = "made-up", playId = "p-1", startedAt = postedAt): HuddlePost => ({ member, name: member, postedAt, play: { ...huddlePostOf(DRAFT, HUDDLE, postedAt).play, id: playId as PlayId, machine, startedAt } })

const withLog = (log: string, gameKind: "pachinko" | "pachislot" = "pachinko"): HuddlePost["play"] => ({ ...huddlePostOf(DRAFT, HUDDLE, DAY).play, log, gameKind }) as HuddlePost["play"]

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

  test("is none once it has left, though it keeps the huddle that day, as left", () => {
    const left: Huddle = { ...HUDDLE, left: true }
    expect(readHuddle(huddleText(left))).toEqual(left)
    expect(huddleOn(left, DAY)).toEqual(left)
    expect(huddleInOn(left, DAY)).toBeUndefined()
    expect(huddleInOn(HUDDLE, DAY)).toEqual(HUDDLE)
    expect(readHuddle(JSON.stringify({ ...HUDDLE, left: false }))).toBeUndefined()
  })

  test("keeps the others' plays it let go of, and has let go of none where it kept no list", () => {
    const letGo = { ...HUDDLE, dismissed: ["b p-1"] }
    expect(readHuddle(huddleText(letGo))).toEqual(letGo)
    const { dismissed: _none, ...before } = HUDDLE
    expect(readHuddle(JSON.stringify(before))).toEqual(HUDDLE)
    expect(readHuddle(JSON.stringify({ ...HUDDLE, dismissed: [1] }))).toBeUndefined()
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
    expect(readHuddleEntry(huddleEntryText(shown))).toEqual(shown)
  })

  test("taken back is its id alone, under who took it back", () => {
    const withdrawn = huddleWithdrawalOf("p-1" as PlayId, HUDDLE, "2026-10-20T02:00:00.000Z")
    expect(withdrawn).toEqual({ member: "me", name: "アキラ", postedAt: "2026-10-20T02:00:00.000Z", withdrawn: "p-1" as PlayId })
    expect(readHuddleEntry(huddleEntryText(withdrawn))).toEqual(withdrawn)
    expect(readHuddleEntry(JSON.stringify({ format: 1, ...withdrawn, play: post("a", "t").play }))).toBeUndefined()
  })

  test("of a member leaving is who left, and nothing else", () => {
    const left = huddleDepartureOf(HUDDLE, "2026-10-20T03:00:00.000Z")
    expect(left).toEqual({ member: "me", name: "アキラ", postedAt: "2026-10-20T03:00:00.000Z", left: true })
    expect(readHuddleEntry(huddleEntryText(left))).toEqual(left)
    expect(readHuddleEntry(JSON.stringify({ format: 1, ...left, left: false }))).toBeUndefined()
    expect(readHuddleEntry(JSON.stringify({ format: 1, ...left, withdrawn: "p-1" }))).toBeUndefined()
  })

  test("is none where its text is not one this app reads", () => {
    expect(readHuddleEntry("not json")).toBeUndefined()
    expect(readHuddleEntry(JSON.stringify({ format: 2, ...post("a", "t") }))).toBeUndefined()
    expect(readHuddleEntry(JSON.stringify({ format: 1, ...post("a", "t"), more: 1 }))).toBeUndefined()
    expect(readHuddleEntry(JSON.stringify({ format: 1, ...post("a", "t"), play: { id: "p" } }))).toBeUndefined()
  })
})

describe("the others' plays", () => {
  test("are each play's latest showing, the others in the order they began their first play, this device's own left out", () => {
    const posts = [post("b", "2026-10-20T01:00:00Z"), post("me", "2026-10-20T01:01:00Z"), post("c", "2026-10-20T01:02:00Z"), post("b", "2026-10-20T01:03:00Z", "same play later", "p-1", "2026-10-20T01:00:00Z")]
    expect(othersPlays(posts, "me").map(({ post: shown, latest }) => [shown.member, shown.play.machine, latest])).toEqual([
      ["b", "same play later", true],
      ["c", "made-up", true],
    ])
  })

  test("put each one's latest first, in the order they began their first play, and the plays left for another machine after them all", () => {
    const posts = [post("b", "2026-10-20T01:00:00Z", "b left"), post("c", "2026-10-20T01:01:00Z", "c on"), post("b", "2026-10-20T02:00:00Z", "b on", "p-2")]
    expect(othersPlays(posts, "me").map(({ post: shown, latest }) => [shown.play.machine, latest])).toEqual([
      ["b on", true],
      ["c on", true],
      ["b left", false],
    ])
  })

  test("keep a play left for another machine, the one moved to the latest and first", () => {
    const posts = [post("b", "2026-10-20T01:00:00Z", "left"), post("b", "2026-10-20T02:00:00Z", "moved to", "p-2")]
    expect(othersPlays(posts, "me").map(({ post: shown, latest }) => [shown.play.machine, latest])).toEqual([
      ["moved to", true],
      ["left", false],
    ])
  })

  test("leave out a play taken back, and only that one", () => {
    const posts = [post("b", "2026-10-20T01:00:00Z", "wrong machine"), post("b", "2026-10-20T01:05:00Z", "right machine", "p-2"), { member: "b", name: "b", postedAt: "2026-10-20T01:06:00Z", withdrawn: "p-1" as PlayId }]
    expect(othersPlays(posts, "me").map(({ post: shown, latest }) => [shown.play.machine, latest])).toEqual([["right machine", true]])
  })

  test("in this device's list leave out those it let go of, and only those, while every one is still there to be counted", () => {
    const posts = [post("b", "2026-10-20T01:00:00Z", "let go"), post("b", "2026-10-20T01:05:00Z", "kept", "p-2")]
    expect(listedFor(othersPlays(posts, "me"), { ...HUDDLE, dismissed: ["b p-1"] }).map(({ post: shown }) => shown.play.machine)).toEqual(["kept"])
    expect(othersPlays(posts, "me")).toHaveLength(2)
  })

  test("mark the plays of one who left the huddle, and put the one they were on after those still in it", () => {
    const left = { member: "b", name: "b", postedAt: "2026-10-20T01:10:00Z", left: true as const }
    const posts = [post("b", "2026-10-20T01:00:00Z", "b moved from"), post("b", "2026-10-20T01:01:00Z", "b on", "p-2"), post("c", "2026-10-20T01:02:00Z", "c on"), left]
    expect(othersPlays(posts, "me").map(({ post: shown, latest, departed }) => [shown.play.machine, latest, departed])).toEqual([
      ["c on", true, false],
      ["b on", true, true],
      ["b moved from", false, true],
    ])
  })

  test("no longer mark one who came back and showed anything since", () => {
    const left = { member: "b", name: "b", postedAt: "2026-10-20T01:10:00Z", left: true as const }
    const posts = [post("b", "2026-10-20T01:00:00Z"), left, post("b", "2026-10-20T01:20:00Z")]
    expect(othersPlays(posts, "me").map(({ departed }) => departed)).toEqual([false])
  })

  test("keep the latest showing of each play alone, with every play taken back and member leaving in its place, and read the same from what is kept", () => {
    const left = { member: "b", name: "b", postedAt: "2026-10-20T01:10:00Z", left: true as const }
    const withdrawn = { member: "c", name: "c", postedAt: "2026-10-20T01:06:00Z", withdrawn: "p-1" as PlayId }
    const entries = [post("b", "2026-10-20T01:00:00Z", "first"), post("c", "2026-10-20T01:01:00Z"), post("b", "2026-10-20T01:05:00Z", "later"), withdrawn, left, post("b", "2026-10-20T01:04:00Z", "late to arrive")]
    expect(latestEntries(entries)).toEqual([post("c", "2026-10-20T01:01:00Z"), post("b", "2026-10-20T01:05:00Z", "later"), withdrawn, left])
    expect(othersPlays(latestEntries(entries), "me")).toEqual(othersPlays(entries, "me"))
  })

  test("stand still however often each play is shown again, and however much of the line is kept", () => {
    const first = [post("b", "2026-10-20T01:00:00Z", "b on"), post("c", "2026-10-20T01:01:00Z", "c on"), post("d", "2026-10-20T01:02:00Z", "d moved from"), post("d", "2026-10-20T01:30:00Z", "d on", "p-2")]
    const again = [...first, post("c", "2026-10-20T02:00:00Z", "c on", "p-1", "2026-10-20T01:01:00Z"), post("d", "2026-10-20T02:01:00Z", "d moved from", "p-1", "2026-10-20T01:02:00Z"), post("b", "2026-10-20T02:02:00Z", "b on", "p-1", "2026-10-20T01:00:00Z")]
    const order = (entries: readonly HuddlePost[]) => othersPlays(latestEntries(entries), "me").map(({ post: shown }) => shown.play.machine)
    expect(order(first)).toEqual(["b on", "c on", "d on", "d moved from"])
    expect(order(again)).toEqual(order(first))
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
    expect(huddleStandingOf(withLog('{"spins":0,"outlay":0}\n{"spins":80,"outlay":1000,"phase":"rapid"}\n', "pachislot"))).toBe("playing")
  })
})

describe("who of the others is in a jackpot", () => {
  const JACKPOT = '{"spins":0,"outlay":0}\n{"spins":120,"outlay":3000,"event":{"kind":"jackpot"}}\n'
  const AGAIN = '{"spins":0,"outlay":0}\n{"spins":120,"outlay":3000,"event":{"kind":"jackpot"}}\n{"spins":125,"outlay":3000,"event":{"kind":"jackpot"}}\n'
  const OVER = '{"spins":0,"outlay":0}\n{"spins":120,"outlay":3000,"event":{"kind":"jackpot"}}\n{"spins":220,"outlay":3000,"phase":"rapid"}\n'
  const shown = (member: string, log: string, latest = true, departed = false) => ({ post: { ...post(member, "2026-10-20T01:00:00Z"), play: withLog(log) }, latest, departed })

  test("stays the same while a jackpot goes on, and changes as it ends or another wins one", () => {
    const first = jackpotsNow([shown("b", JACKPOT)])
    expect(jackpotsNow([shown("b", AGAIN)])).toBe(first)
    expect(jackpotsNow([shown("b", OVER)])).not.toBe(first)
    expect(jackpotsNow([shown("b", AGAIN), shown("c", JACKPOT)])).not.toBe(first)
  })

  test("is nobody for a play left behind in one, one whose player left the huddle, or with nobody there", () => {
    expect(jackpotsNow([shown("b", JACKPOT, false)])).toBe("")
    expect(jackpotsNow([shown("b", JACKPOT, true, true)])).toBe("")
    expect(jackpotsNow([])).toBe("")
  })
})

describe("the jackpots one of the others' plays won in a row", () => {
  test("are those since its last reading of regular games, readings in 時短 between them or not", () => {
    expect(jackpotStreakOf(withLog('{"spins":0,"outlay":0}\n{"spins":120,"outlay":3000,"event":{"kind":"jackpot"}}\n{"spins":150,"outlay":3000,"phase":"rapid"}\n{"spins":160,"outlay":3000,"event":{"kind":"jackpot"}}\n{"spins":170,"outlay":3000,"event":{"kind":"jackpot"}}\n'))).toBe(3)
  })

  test("count a bonus won over several jackpots as each of them", () => {
    expect(jackpotStreakOf(withLog('{"spins":0,"outlay":0}\n{"spins":120,"outlay":3000,"event":{"kind":"jackpot","bonus":{"name":"20R","payout":3000,"spent":200,"jackpots":2}}}\n'))).toBe(2)
  })

  test("begin again at a reading of regular games, and are none before a jackpot", () => {
    expect(jackpotStreakOf(withLog('{"spins":0,"outlay":0}\n{"spins":120,"outlay":3000,"event":{"kind":"jackpot"}}\n{"spins":300,"outlay":6000}\n{"spins":350,"outlay":7000,"event":{"kind":"jackpot"}}\n'))).toBe(1)
    expect(jackpotStreakOf(withLog('{"spins":0,"outlay":0}\n{"spins":30,"outlay":1000}\n'))).toBe(0)
  })
})

describe("the plays this device gave up", () => {
  test("are those it showed, never took back and no longer keeps", () => {
    const entries = [post("me", "2026-10-20T01:00:00Z"), post("me", "2026-10-20T01:01:00Z", "made-up", "p-2"), post("me", "2026-10-20T01:02:00Z", "made-up", "p-3"), post("b", "2026-10-20T01:03:00Z", "made-up", "p-4"), { member: "me", name: "me", postedAt: "2026-10-20T01:04:00Z", withdrawn: "p-3" as PlayId }]
    expect(givenUp(entries, "me", new Set(["p-2"]))).toEqual(["p-1" as PlayId])
  })
})

describe("how the huddle's game turned", () => {
  test("is a jackpot won where someone is in one who was not, from regular games or beside another's", () => {
    expect(huddleTurnOf("", "b p-1")).toBe("won")
    expect(huddleTurnOf("b p-1", "b p-1\nc p-2")).toBe("won")
    expect(huddleTurnOf("b p-1", "c p-2")).toBe("won")
  })

  test("is one ended where only those in one came out of it, and nothing where nobody moved", () => {
    expect(huddleTurnOf("b p-1\nc p-2", "c p-2")).toBe("ended")
    expect(huddleTurnOf("b p-1", "")).toBe("ended")
    expect(huddleTurnOf("b p-1", "b p-1")).toBeUndefined()
  })

  test("keeps a jackpot won the louder until it is looked at", () => {
    expect(louderTurn("won", "ended")).toBe("won")
    expect(louderTurn("ended", "won")).toBe("won")
    expect(louderTurn(undefined, "ended")).toBe("ended")
    expect(louderTurn("ended", undefined)).toBe("ended")
  })
})
