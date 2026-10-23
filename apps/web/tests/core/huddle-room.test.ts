import { describe, expect, test } from "bun:test"

import type { IsoDate } from "../../src/core/calendar/calendar"
import type { Huddle } from "../../src/core/huddle/huddle"
import type { HuddlePlay } from "../../src/core/huddle/post"
import { ofHuddleDay, playsOfChosen, roomMembersOf, roomPlaysOf, roomTotalOf } from "../../src/core/huddle/room"
import { IDLE_AFTER, idleMembers, othersInJackpot } from "../../src/core/huddle/standing"
import type { PachinkoDraft, PachislotDraft } from "../../src/core/live-play/draft"
import type { PlayTerms } from "../../src/core/parlor/terms"
import type { PlayId } from "../../src/core/play/play"

const DAY = "2026-10-20" as IsoDate
const HUDDLE: Huddle = { secret: "a".repeat(43), businessDay: DAY, member: "me", name: "アキラ", dismissed: [] }

/** 280 balls to ¥1,000: a ball is worth 1000/280 yen. */
const TERMS: PlayTerms = { rental: { yen: 1000, tokens: 250 }, exchange: { yen: 1000, tokens: 280 }, replay: { paidOut: 250, deducted: 250 } }

const draft = (id: string, startedAt: string, log: string): PachinkoDraft => ({
  id: id as PlayId,
  date: DAY,
  venue: { type: "none", terms: TERMS },
  gameKind: "pachinko",
  machine: "made-up",
  pachinko: undefined,
  cabinetNumber: undefined,
  startedAt,
  log,
})

const theirs = (member: string, id: string, log: string, latest: boolean, departed = false, startedAt = "2026-10-20T01:00:00Z"): HuddlePlay => ({
  post: { member, name: `name-${member}`, postedAt: "2026-10-20T02:00:00Z", play: draft(id, startedAt, log) },
  latest,
  departed,
})

describe("a huddle's room", () => {
  const own = [draft("mine-1", "2026-10-20T01:00:00Z", '{"spins":0,"outlay":0}\n{"spins":200,"outlay":5000,"held":0}\n'), draft("mine-2", "2026-10-20T03:00:00Z", '{"spins":0,"outlay":0}\n{"spins":90,"outlay":2000,"held":560}\n')]
  const received = { ...draft("sent-to-me", "2026-10-20T04:00:00Z", '{"spins":0,"outlay":9000}\n'), received: { sender: "仲間", log: "", finished: undefined } }
  const others = [theirs("b", "b-2", '{"spins":0,"outlay":0}\n{"spins":50,"outlay":1000,"held":280}\n', true), theirs("b", "b-1", '{"spins":0,"outlay":0}\n{"spins":300,"outlay":7000,"held":1000}\n', false)]

  test("lists everyone's plays alike, this device's own among them: the one each is on in the order they began, then every play moved from, the one begun last first; and leaves out what was sent to it", () => {
    const listed = [theirs("b", "b-2", "", true, false, "2026-10-20T02:00:00Z"), theirs("b", "b-1", "", false, false, "2026-10-20T00:30:00Z")]
    expect(roomPlaysOf(HUDDLE, [...own, received], listed, new Set()).map(({ member, play, latest }) => [member, String(play.id), latest])).toEqual([
      ["b", "b-2", true],
      ["me", "mine-2", true],
      ["me", "mine-1", false],
      ["b", "b-1", false],
    ])
  })

  test("puts the play each who has gone quiet is on just above the plays left for another machine, below those who left", () => {
    const listed = [theirs("c", "c-1", "", true), theirs("d", "d-1", "", true), theirs("e", "e-1", "", true, true), theirs("c", "c-0", "", false)]
    expect(roomPlaysOf(HUDDLE, [], listed, new Set(["d", "e"])).map(({ play }) => String(play.id))).toEqual(["c-1", "e-1", "d-1", "c-0"])
    expect(roomPlaysOf(HUDDLE, [], listed, new Set()).map(({ play }) => String(play.id))).toEqual(["c-1", "d-1", "e-1", "c-0"])
  })

  test("has this device first among its members, then each of the others once", () => {
    expect(roomMembersOf(HUDDLE, others)).toEqual([
      { member: "me", name: "アキラ", own: true },
      { member: "b", name: "name-b", own: false },
    ])
  })

  test("adds up the cash of every play, and the balls in hand of the play each is on alone, with the special prizes they exchange for", () => {
    const total = roomTotalOf(roomPlaysOf(HUDDLE, own, others, new Set()), 500)
    expect(total.outlay).toBe(5000 + 2000 + 1000 + 7000)
    expect(total.held.pachinko).toEqual({ tokens: 560 + 280, specialPrizes: 2000 + 1000, oddTokens: 0 })
    expect(total.held.pachislot).toEqual({ tokens: 0, specialPrizes: 0, oddTokens: 0 })
  })

  test("counts medals apart from balls, and no special prizes where the corner is not known", () => {
    const medals: PachislotDraft = { ...draft("slot", "2026-10-20T05:00:00Z", '{"spins":0,"outlay":0}\n{"spins":100,"outlay":3000,"held":150}\n'), gameKind: "pachislot", venue: { type: "none", terms: undefined } }
    expect(roomTotalOf(roomPlaysOf(HUDDLE, [medals], [], new Set()), 500).held).toEqual({ pachinko: { tokens: 0, specialPrizes: 0, oddTokens: 0 }, pachislot: { tokens: 150, specialPrizes: 0, oddTokens: 0 } })
  })

  test("counts the balls in hand out as special prizes a smallest one of the step apart, and the odd balls beside them apart", () => {
    const odd = draft("odd", "2026-10-20T05:00:00Z", '{"spins":0,"outlay":0}\n{"spins":100,"outlay":1000,"held":300}\n')
    expect(roomTotalOf(roomPlaysOf(HUDDLE, [odd], [], new Set()), 500).held.pachinko).toEqual({ tokens: 300, specialPrizes: 1000, oddTokens: 20 })
    expect(roomTotalOf(roomPlaysOf(HUDDLE, [odd], [], new Set()), 100).held.pachinko).toEqual({ tokens: 300, specialPrizes: 1000, oddTokens: 20 })
    expect(roomTotalOf(roomPlaysOf(HUDDLE, [{ ...odd, venue: { type: "none", terms: undefined } }], [], new Set()), 500).held.pachinko).toEqual({ tokens: 300, specialPrizes: 0, oddTokens: 0 })
  })

  test("keeps out plays of a day before, one's own left unrecorded and any a member still shows, from the room and what it comes to", () => {
    const yesterday = "2026-10-19" as IsoDate
    const leftOver: PachinkoDraft = { ...draft("mine-0", "2026-10-19T12:00:00Z", '{"spins":0,"outlay":0}\n{"spins":400,"outlay":10000,"held":0}\n'), date: yesterday }
    const theirsBefore: HuddlePlay = { post: { member: "b", name: "name-b", postedAt: "2026-10-20T02:00:00Z", play: { ...draft("b-0", "2026-10-19T12:00:00Z", '{"spins":0,"outlay":20000}\n'), date: yesterday } }, latest: false, departed: false }
    const plays = roomPlaysOf(HUDDLE, [...own, leftOver], [...others, theirsBefore], new Set())
    expect(plays.map(({ play }) => String(play.id)).toSorted()).toEqual(["b-1", "b-2", "mine-1", "mine-2"])
    expect(roomTotalOf(plays, 500).outlay).toBe(5000 + 2000 + 1000 + 7000)
    expect([ofHuddleDay(HUDDLE, leftOver), ofHuddleDay(HUDDLE, own[0] ?? leftOver)]).toEqual([false, true])
  })

  test("adds up only those chosen, and everyone where nothing is left out", () => {
    const plays = roomPlaysOf(HUDDLE, own, others, new Set())
    expect(roomTotalOf(playsOfChosen(plays, ["me"]), 500).outlay).toBe(7000)
    expect(playsOfChosen(plays, undefined)).toBe(plays)
    expect(playsOfChosen(plays, [])).toEqual([])
  })

  test("wears on the rail how many of the others still in it and heard from lately are in a jackpot on the play they are on", () => {
    const jackpot = '{"spins":0,"outlay":0}\n{"spins":120,"outlay":3000,"event":{"kind":"jackpot"}}\n'
    const plays = [theirs("b", "b-1", jackpot, true), theirs("c", "c-1", jackpot, true), theirs("d", "d-1", jackpot, false), theirs("e", "e-1", jackpot, true, true)]
    expect(othersInJackpot(plays, new Set())).toBe(2)
    expect(othersInJackpot(plays, new Set(["c"]))).toBe(1)
  })

  test("tells who has put nothing on the line for an hour and a half, by the latest thing each said", () => {
    const now = Date.parse("2026-10-20T05:00:00Z")
    const said = (member: string, postedAt: string) => ({ member, name: member, postedAt, left: true as const })
    const entries = [said("b", "2026-10-20T03:00:00Z"), said("b", "2026-10-20T04:00:00Z"), said("c", "2026-10-20T03:30:00Z"), said("d", "2026-10-20T03:29:59Z")]
    expect([...idleMembers(entries, now)].toSorted()).toEqual(["c", "d"])
    expect(IDLE_AFTER).toBe(90 * 60_000)
  })
})
