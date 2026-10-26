import { describe, expect, test } from "bun:test"

import { ballsPerSpin, borderOf, playTheoreticalValue, theoreticalValueOf, yenPerHour, yenPerSpin } from "../../../src/core/pachinko/theoretical-value"
import type { Figures } from "../../../src/core/pachinko/figures"
import { tokenValueOf } from "../../../src/core/parlor/terms"

const SAMPLE: Figures = { roundChanceOneIn: 100 / 30, payoutPerRound: 140, totalChanceOneIn: 100 / 3, spinsPerHour: 200 }

const close = (left: number, right: number): boolean => Math.abs(left - right) < 1e-9

describe("a theoretical value from a formula's figures", () => {
  test("a spin wins the 1R payout over the 1R chance", () => {
    expect(close(ballsPerSpin(SAMPLE), 0.01 * 30 * 140)).toBe(true)
  })

  test("the border is where a spin's winnings repay its cost", () => {
    expect(close(borderOf(SAMPLE, 4), 1000 / (0.01 * 4200 * 4))).toBe(true)
  })

  test("the theoretical value per spin, per hour, and over a play", () => {
    const play = { spinPerformance: 20, ballValue: 4 }
    expect(close(yenPerSpin(SAMPLE, play), 168 - 50)).toBe(true)
    expect(close(yenPerHour(SAMPLE, play) ?? Number.NaN, 118 * 200)).toBe(true)
    expect(close(theoreticalValueOf(SAMPLE, play, 1000), 118_000)).toBe(true)
    expect(yenPerHour({ ...SAMPLE, spinsPerHour: undefined }, play)).toBeUndefined()
  })
})

describe("a play's theoretical value", () => {
  const TERMS = { rental: { yen: 1000, tokens: 250 }, exchange: { yen: 1000, tokens: 250 }, replay: { paidOut: 125, deducted: 125 } }

  test("needs the corner's terms and a measured stretch of regular games", () => {
    expect(playTheoreticalValue(SAMPLE, undefined, { regularSpins: 100, measured: { spins: 100, balls: 1250, rentedBalls: 1250, replayedBalls: 0 }, payoutRatio: undefined, supportRatio: undefined })).toBeUndefined()
    expect(playTheoreticalValue(SAMPLE, TERMS, { regularSpins: 100, measured: undefined, payoutRatio: undefined, supportRatio: undefined })).toBeUndefined()
  })

  test("weighs the formula against what the measured games cost, over every regular spin", () => {
    const found = playTheoreticalValue(SAMPLE, TERMS, { regularSpins: 500, measured: { spins: 400, balls: 5000, rentedBalls: 5000, replayedBalls: 0 }, payoutRatio: undefined, supportRatio: undefined })
    expect(found && close(found.spinPerformance, 20)).toBe(true)
    expect(found && close(found.theoreticalValue, 118 * 500)).toBe(true)
    expect(found && close(found.border, 1000 / 168)).toBe(true)
    expect(found && close(found.yenPerHour ?? Number.NaN, 118 * 200)).toBe(true)
  })

  test("counts the player's own balls, and those drawn from savings, at what they exchange for", () => {
    const dear = { ...TERMS, exchange: { yen: 1000, tokens: 280 }, replay: { paidOut: 125, deducted: 133 } }
    const value = 1000 / 280
    const found = playTheoreticalValue(SAMPLE, dear, { regularSpins: 100, measured: { spins: 100, balls: 1250, rentedBalls: 250, replayedBalls: 125 }, payoutRatio: undefined, supportRatio: undefined })
    const cost = 1000 + 133 * value + 875 * value
    expect(found && Math.abs(found.yenPerSpin - (42 * value - cost / 100)) < 1e-3).toBe(true)
  })

  test("breaks even at a border below the formula's where balls were the player's own, and at the formula's where all were rented", () => {
    const dear = { ...TERMS, exchange: { yen: 1000, tokens: 280 } }
    const rented = playTheoreticalValue(SAMPLE, dear, { regularSpins: 100, measured: { spins: 100, balls: 1250, rentedBalls: 1250, replayedBalls: 0 }, payoutRatio: undefined, supportRatio: undefined })
    const own = playTheoreticalValue(SAMPLE, dear, { regularSpins: 100, measured: { spins: 100, balls: 1250, rentedBalls: 0, replayedBalls: 0 }, payoutRatio: undefined, supportRatio: undefined })
    expect(rented && close(rented.border, borderOf(SAMPLE, tokenValueOf(dear)))).toBe(true)
    expect(own && close(own.border, 250 / 42)).toBe(true)
    expect(own && rented && own.border < rented.border).toBe(true)
  })

  test("has the spin performance above its border exactly when a spin is worth more than nothing", () => {
    const dear = { ...TERMS, exchange: { yen: 1000, tokens: 280 }, replay: { paidOut: 125, deducted: 133 } }
    const plays = [5000, 2000, 1600, 1500, 1400, 1250, 1000].map((balls) => playTheoreticalValue(SAMPLE, dear, { regularSpins: 100, measured: { spins: 100, balls, rentedBalls: 250, replayedBalls: 125 }, payoutRatio: undefined, supportRatio: undefined }))
    expect(plays.every((play) => play !== undefined && play.spinPerformance > play.border === play.yenPerSpin > 0)).toBe(true)
    expect(new Set(plays.map((play) => play !== undefined && play.yenPerSpin > 0)).size).toBe(2)
  })
})
