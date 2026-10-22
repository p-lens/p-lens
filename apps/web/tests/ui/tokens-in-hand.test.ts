import { describe, expect, test } from "bun:test"

import type { IsoDate } from "../../src/core/calendar/calendar"
import type { PlayVenue } from "../../src/core/live-play/draft"
import type { TokenTally } from "../../src/core/tally/tally"
import type { PlayId } from "../../src/core/play/play"
import { carriedInShown, leftAt, leftBy, readCarriedIn, recalledTokensInHand, tokensCarriedTo, tokensInHandUnreadable, tokensKeptAfter, tokensStillInHand, writtenTokensInHand, type TokensInHand } from "../../src/ui/features/live/tokens-in-hand"
import { RENTED_PLAY, MALEHAN, dec } from "../support/values"

const DAY = "2026-10-12" as IsoDate

const TERMS = { rental: { yen: 1000, tokens: 250 }, exchange: { yen: 1000, tokens: 280 }, replay: { paidOut: 125, deducted: 125 } }

const IN_HAND: TokensInHand = { identity: MALEHAN.identity, pool: { kind: "ball", tier: "4円" }, count: 1500, from: "a" as PlayId }

const KEPT = writtenTokensInHand(DAY, IN_HAND)

const AT_MALEHAN: PlayVenue = { type: "parlor", parlor: MALEHAN, terms: TERMS }

const PLAYED: TokenTally = { ...RENTED_PLAY, date: DAY, payout: dec("1500") }

const LEFT = leftBy(PLAYED)

describe("the tokens in hand between two plays of a day", () => {
  test("are recalled as they were written, on the day they were left, and not the day after", () => {
    expect(recalledTokensInHand(KEPT, DAY)).toEqual({ type: "kept", inHand: IN_HAND })
    expect(recalledTokensInHand(KEPT, "2026-10-13" as IsoDate)).toEqual({ type: "none" })
    expect(recalledTokensInHand(undefined, DAY)).toEqual({ type: "none" })
  })

  test("are told apart where what is kept does not read, and not taken for none", () => {
    const counted = (count: unknown): string => JSON.stringify({ ...(JSON.parse(KEPT) as object), count })
    expect(recalledTokensInHand("not json", DAY)).toEqual({ type: "unreadable" })
    expect(recalledTokensInHand(counted("500"), DAY)).toEqual({ type: "unreadable" })
    expect(tokensInHandUnreadable(counted("500"), DAY)).toBe(true)
    expect(tokensInHandUnreadable(KEPT, DAY)).toBe(false)
    expect(tokensCarriedTo(counted("500"), DAY, AT_MALEHAN, "pachinko")).toBeUndefined()
  })

  test("stay kept on their day, or while what is kept does not read, and are let go of once the day has turned over", () => {
    expect(tokensStillInHand(KEPT, DAY)).toBe(KEPT)
    expect(tokensStillInHand(KEPT, "2026-10-13" as IsoDate)).toBeUndefined()
    expect(tokensStillInHand("not json", DAY)).toBe("not json")
    expect(tokensStillInHand(undefined, DAY)).toBeUndefined()
  })

  test("are what the next play at that parlor and of that pool is begun with, and no other play", () => {
    expect(tokensCarriedTo(KEPT, DAY, AT_MALEHAN, "pachinko")).toBe(1500)
    expect(tokensCarriedTo(KEPT, DAY, { ...AT_MALEHAN, terms: { ...TERMS, rental: { yen: 1000, tokens: 1000 }, exchange: { yen: 1000, tokens: 1000 } } }, "pachinko")).toBeUndefined()
    expect(tokensCarriedTo(KEPT, DAY, AT_MALEHAN, "pachislot")).toBeUndefined()
    expect(tokensCarriedTo(KEPT, DAY, { ...AT_MALEHAN, parlor: { ...MALEHAN, identity: { type: "listed", id: "elsewhere" as never } } }, "pachinko")).toBeUndefined()
    expect(tokensCarriedTo(KEPT, DAY, { type: "none", terms: TERMS }, "pachinko")).toBeUndefined()
    expect(tokensCarriedTo(KEPT, "2026-10-13" as IsoDate, AT_MALEHAN, "pachinko")).toBeUndefined()
  })

  test("are what a play left as it is recorded, and nothing where it left none", () => {
    expect(tokensKeptAfter(undefined, DAY, { id: "a" as PlayId, recordedBefore: false }, LEFT)).toBe(KEPT)
    expect(tokensKeptAfter(KEPT, DAY, { id: "b" as PlayId, recordedBefore: false }, { ...LEFT, count: 0 })).toBeUndefined()
  })

  test("are changed by a play recorded again only while they are still that play's", () => {
    const again = { ...LEFT, count: 1800 }
    expect(recalledTokensInHand(tokensKeptAfter(KEPT, DAY, { id: "a" as PlayId, recordedBefore: true }, again), DAY)).toEqual({ type: "kept", inHand: { ...IN_HAND, count: 1800 } })
    expect(tokensKeptAfter(undefined, DAY, { id: "a" as PlayId, recordedBefore: true }, again)).toBeUndefined()
    expect(tokensKeptAfter(KEPT, DAY, { id: "b" as PlayId, recordedBefore: true }, again)).toBe(KEPT)
  })

  test("are in hand at no parlor too, for the next play at none and of that pool, and at no parlor's", () => {
    const nowhere: PlayVenue = { type: "none", terms: TERMS }
    const left = leftAt(nowhere, "pachinko", DAY, 25)
    const kept = tokensKeptAfter(undefined, DAY, { id: "n" as PlayId, recordedBefore: false }, left ?? LEFT)
    expect(left).toEqual({ identity: undefined, pool: { kind: "ball", tier: "4円" }, date: DAY, count: 25 })
    expect(recalledTokensInHand(kept, DAY)).toEqual({ type: "kept", inHand: { identity: undefined, pool: { kind: "ball", tier: "4円" }, count: 25, from: "n" as PlayId } })
    expect(tokensCarriedTo(kept, DAY, nowhere, "pachinko")).toBe(25)
    expect(tokensCarriedTo(kept, DAY, AT_MALEHAN, "pachinko")).toBeUndefined()
    expect(tokensCarriedTo(KEPT, DAY, nowhere, "pachinko")).toBeUndefined()
    expect(tokensCarriedTo(kept, DAY, { type: "none", terms: undefined }, "pachinko")).toBeUndefined()
    expect(leftAt({ type: "none", terms: undefined }, "pachinko", DAY, 25)).toBeUndefined()
  })

  test("are shown at the start as kept until typed over, and read as a count or as none", () => {
    expect(carriedInShown(undefined, 1500)).toBe("1500")
    expect(carriedInShown(undefined, undefined)).toBe("")
    expect(carriedInShown("", 1500)).toBe("")
    expect(carriedInShown("２５", 1500)).toBe("２５")
    expect(["", "0", "２５", "1,500", "2.5", "abc"].map(readCarriedIn)).toEqual([{ type: "none" }, { type: "none" }, { type: "count", count: 25 }, { type: "count", count: 1500 }, { type: "unread" }, { type: "unread" }])
  })

  test("are not left by a play of another day", () => {
    expect(tokensKeptAfter(KEPT, DAY, { id: "c" as PlayId, recordedBefore: false }, { ...LEFT, date: "2026-10-11" as IsoDate })).toBe(KEPT)
  })
})
