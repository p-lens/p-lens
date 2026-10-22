import { describe, expect, test } from "bun:test"

import type { IsoDate } from "../../src/core/calendar/calendar"
import type { Huddle } from "../../src/core/huddle/huddle"
import type { HuddlePlay } from "../../src/core/huddle/post"
import { playsOfChosen, roomMembersOf, roomPlaysOf, roomTotalOf } from "../../src/core/huddle/room"
import { othersInJackpot } from "../../src/core/huddle/standing"
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

const theirs = (member: string, id: string, log: string, latest: boolean, departed = false): HuddlePlay => ({
  post: { member, name: `name-${member}`, postedAt: "2026-10-20T02:00:00Z", play: draft(id, "2026-10-20T01:00:00Z", log) },
  latest,
  departed,
})

describe("a huddle's room", () => {
  const own = [draft("mine-1", "2026-10-20T01:00:00Z", '{"spins":0,"outlay":0}\n{"spins":200,"outlay":5000,"held":0}\n'), draft("mine-2", "2026-10-20T03:00:00Z", '{"spins":0,"outlay":0}\n{"spins":90,"outlay":2000,"held":560}\n')]
  const received = { ...draft("sent-to-me", "2026-10-20T04:00:00Z", '{"spins":0,"outlay":9000}\n'), received: { sender: "仲間", log: "", finished: undefined } }
  const others = [theirs("b", "b-2", '{"spins":0,"outlay":0}\n{"spins":50,"outlay":1000,"held":280}\n', true), theirs("b", "b-1", '{"spins":0,"outlay":0}\n{"spins":300,"outlay":7000,"held":1000}\n', false)]

  test("lists this device's own plays first, newest begun first and the one it is on, then the others', and leaves out what was sent to it", () => {
    expect(roomPlaysOf(HUDDLE, [...own, received], others).map(({ member, play, latest }) => [member, play.id, latest])).toEqual([
      ["me", "mine-2", true],
      ["me", "mine-1", false],
      ["b", "b-2", true],
      ["b", "b-1", false],
    ])
  })

  test("has this device first among its members, then each of the others once", () => {
    expect(roomMembersOf(HUDDLE, others)).toEqual([
      { member: "me", name: "アキラ", own: true },
      { member: "b", name: "name-b", own: false },
    ])
  })

  test("adds up the cash of every play, and the balls in hand of the play each is on alone, with what they come to at its exchange rate", () => {
    const total = roomTotalOf(roomPlaysOf(HUDDLE, own, others))
    expect(total.outlay).toBe(5000 + 2000 + 1000 + 7000)
    expect(total.held.pachinko).toEqual({ tokens: 560 + 280, yen: 2000 + 1000 })
    expect(total.held.pachislot).toEqual({ tokens: 0, yen: 0 })
  })

  test("counts medals apart from balls, and nothing in yen where the corner is not known", () => {
    const medals: PachislotDraft = { ...draft("slot", "2026-10-20T05:00:00Z", '{"spins":0,"outlay":0}\n{"spins":100,"outlay":3000,"held":150}\n'), gameKind: "pachislot", venue: { type: "none", terms: undefined } }
    expect(roomTotalOf(roomPlaysOf(HUDDLE, [medals], [])).held).toEqual({ pachinko: { tokens: 0, yen: 0 }, pachislot: { tokens: 150, yen: 0 } })
  })

  test("adds up only those chosen, and everyone where nothing is left out", () => {
    const plays = roomPlaysOf(HUDDLE, own, others)
    expect(roomTotalOf(playsOfChosen(plays, ["me"])).outlay).toBe(7000)
    expect(playsOfChosen(plays, undefined)).toBe(plays)
    expect(playsOfChosen(plays, [])).toEqual([])
  })

  test("wears on the rail how many of the others still in it are in a jackpot on the play they are on", () => {
    const jackpot = '{"spins":0,"outlay":0}\n{"spins":120,"outlay":3000,"event":{"kind":"jackpot"}}\n'
    expect(othersInJackpot([theirs("b", "b-1", jackpot, true), theirs("c", "c-1", jackpot, true), theirs("d", "d-1", jackpot, false), theirs("e", "e-1", jackpot, true, true)])).toBe(2)
  })
})
