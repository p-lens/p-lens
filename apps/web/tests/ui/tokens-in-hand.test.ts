import { describe, expect, test } from "bun:test"

import type { IsoDate } from "../../src/core/calendar/calendar"
import type { PlayVenue } from "../../src/core/live-play/draft"
import type { PlayId, PlayRecord } from "../../src/core/play/play"
import { recalledTokensInHand, tokensCarriedTo, tokensKeptAfter, tokensStillInHand, writtenTokensInHand, type TokensInHand } from "../../src/ui/features/live/tokens-in-hand"
import { RENTED_PLAY, UMEDA, dec } from "../support/values"

const DAY = "2026-10-12" as IsoDate

const TERMS = { rental: { yen: 1000, tokens: 250 }, exchange: { yen: 1000, tokens: 280 }, replay: { paidOut: 125, deducted: 125 } }

const IN_HAND: TokensInHand = { identity: UMEDA.identity, pool: { kind: "ball", tier: "4円" }, count: 1500, from: "a" as PlayId }

const KEPT = writtenTokensInHand(DAY, IN_HAND)

const AT_UMEDA: PlayVenue = { type: "parlor", parlor: UMEDA, terms: TERMS }

const LEFT: PlayRecord = { ...RENTED_PLAY, date: DAY, payout: dec("1500") }

describe("the tokens in hand between two plays of a day", () => {
  test("are recalled as they were written, on the day they were left, and not the day after", () => {
    expect(recalledTokensInHand(KEPT, DAY)).toEqual(IN_HAND)
    expect(recalledTokensInHand(KEPT, "2026-10-13" as IsoDate)).toBeUndefined()
    expect(recalledTokensInHand("not json", DAY)).toBeUndefined()
    expect(recalledTokensInHand(undefined, DAY)).toBeUndefined()
  })

  test("stay kept on their day and are let go of once it has turned over", () => {
    expect(tokensStillInHand(KEPT, DAY)).toBe(KEPT)
    expect(tokensStillInHand(KEPT, "2026-10-13" as IsoDate)).toBeUndefined()
    expect(tokensStillInHand("not json", DAY)).toBeUndefined()
    expect(tokensStillInHand(undefined, DAY)).toBeUndefined()
  })

  test("are what the next play at that parlor and of that pool is begun with, and no other play", () => {
    expect(tokensCarriedTo(KEPT, DAY, AT_UMEDA, "pachinko")).toBe(1500)
    expect(tokensCarriedTo(KEPT, DAY, { ...AT_UMEDA, terms: { ...TERMS, rental: { yen: 1000, tokens: 1000 }, exchange: { yen: 1000, tokens: 1000 } } }, "pachinko")).toBeUndefined()
    expect(tokensCarriedTo(KEPT, DAY, AT_UMEDA, "slot")).toBeUndefined()
    expect(tokensCarriedTo(KEPT, DAY, { ...AT_UMEDA, parlor: { ...UMEDA, identity: { type: "listed", id: "elsewhere" as never } } }, "pachinko")).toBeUndefined()
    expect(tokensCarriedTo(KEPT, DAY, { type: "none", terms: TERMS }, "pachinko")).toBeUndefined()
    expect(tokensCarriedTo(KEPT, "2026-10-13" as IsoDate, AT_UMEDA, "pachinko")).toBeUndefined()
  })

  test("are what a play left as it is recorded, and nothing where it left none", () => {
    expect(tokensKeptAfter(undefined, DAY, { id: "a" as PlayId, recordedBefore: false }, LEFT)).toBe(KEPT)
    expect(tokensKeptAfter(KEPT, DAY, { id: "b" as PlayId, recordedBefore: false }, { ...LEFT, payout: dec("0") })).toBeUndefined()
  })

  test("are changed by a play recorded again only while they are still that play's", () => {
    const again = { ...LEFT, payout: dec("1800") }
    expect(recalledTokensInHand(tokensKeptAfter(KEPT, DAY, { id: "a" as PlayId, recordedBefore: true }, again), DAY)?.count).toBe(1800)
    expect(tokensKeptAfter(undefined, DAY, { id: "a" as PlayId, recordedBefore: true }, again)).toBeUndefined()
    expect(tokensKeptAfter(KEPT, DAY, { id: "b" as PlayId, recordedBefore: true }, again)).toBe(KEPT)
  })

  test("are not left by a play of another day", () => {
    expect(tokensKeptAfter(KEPT, DAY, { id: "c" as PlayId, recordedBefore: false }, { ...LEFT, date: "2026-10-11" as IsoDate })).toBe(KEPT)
  })
})
