import { afterEach, describe, expect, test } from "bun:test"
import type { JSX } from "solid-js"

import { isWholeShown, seal, Secret, turnMumming, veil } from "../../src/mummer"

afterEach(() => turnMumming(false))

const figureOf = (secret: Secret<"savings" | "tally" | "play", number>): string => veil.figure(secret, (value) => String(value), "•")
const toneOf = (secret: Secret<"savings" | "tally" | "play", number>): string => veil.tone(secret, (value) => (value < 0 ? "negative" : "positive"), "neutral")
const scaleOf = (secret: Secret<"savings" | "tally" | "play", number>): number => veil.scale(secret, (value) => value / 100, 1)

describe("veil", () => {
  test("shows every facet of every kind outside mumming", () => {
    expect([seal.savings(-30), seal.tally(-30), seal.play(-30)].map((secret) => [figureOf(secret), toneOf(secret), scaleOf(secret)])).toEqual([
      ["-30", "negative", -0.3],
      ["-30", "negative", -0.3],
      ["-30", "negative", -0.3],
    ])
    expect(veil.text(seal.parlor("東京皇国 第8支店"), (name) => name, "••••店")).toBe("東京皇国 第8支店")
  })

  test("while mumming, shows each facet as the policy says: a play whole, a tally's way only, savings nothing", () => {
    turnMumming(true)
    expect([seal.savings(-30), seal.tally(-30), seal.play(-30)].map((secret) => [figureOf(secret), toneOf(secret), scaleOf(secret)])).toEqual([
      ["•", "neutral", 1],
      ["•", "negative", 1],
      ["-30", "negative", -0.3],
    ])
  })

  test("while mumming, veils a parlor's name and a cabinet's number, and lets a name's length be known", () => {
    turnMumming(true)
    expect(veil.text(seal.parlor("東京皇国 第8支店"), (name) => name, "••••店")).toBe("••••店")
    expect(veil.length(seal.parlor("東京皇国 第8支店"), (name) => name.length, 0)).toBe(9)
    expect(veil.text(seal.cabinet("123"), (number) => number, "•••")).toBe("•••")
  })

  test("while mumming, withholds whole what no veil can stand over: a book's files, the codes into a book, and the forms its figures are typed into", () => {
    expect((["journal", "invitation", "tally", "savings"] as const).map(isWholeShown)).toEqual([true, true, true, true])
    turnMumming(true)
    expect((["journal", "invitation", "tally", "savings"] as const).map(isWholeShown)).toEqual([false, false, false, false])
  })

  test("while mumming, veils an entry's text and keeps how many lines it takes", () => {
    const written = "2026-10-20 店 | 機種\n    資産:現金  -1000 JPY\n    費用:遊技"
    const entry = seal.journal(written)
    expect([veil.text(entry, (text) => text, ""), veil.length(entry, (text) => text.split("\n").length, 1)]).toEqual([written, 3])
    turnMumming(true)
    expect([veil.text(entry, (text) => text, ""), veil.length(entry, (text) => text.split("\n").length, 1)]).toEqual(["", 3])
  })

  test("follows mumming as it is turned off again", () => {
    turnMumming(true)
    turnMumming(false)
    expect(figureOf(seal.tally(5))).toBe("5")
  })
})

describe("a secret", () => {
  test("made a string by mistake gives its veiled shape, whether mumming or not", () => {
    const secret = seal.tally(12_340)
    expect([`${String(secret)}`, `${secret as unknown as string}`, JSON.stringify({ secret })]).toEqual(["•••", "•••", '{"secret":"•••"}'])
  })

  test("is worked out without opening, keeping its kind", () => {
    turnMumming(true)
    const doubled = Secret.map(seal.tally(21), (value) => value * 2)
    const summed = Secret.lift2(seal.play(1), seal.play(2), (first, second) => first + second)
    expect([doubled.kind, summed.kind, figureOf(doubled), figureOf(summed)]).toEqual(["tally", "play", "•", "3"])
  })

  test("is never drawn, never mixed with another kind, and never shown as a facet its kind does not have", () => {
    // @ts-expect-error a secret is not something a screen draws
    const drawn: JSX.Element = seal.tally(1)
    // @ts-expect-error two kinds are never mixed
    const mixed = Secret.lift2(seal.tally(1), seal.savings(2), (first: number, second: number) => first + second)
    // @ts-expect-error a parlor has no figure
    const figured = veil.figure(seal.parlor("x"), (name) => name, "•")
    // @ts-expect-error what veil gives is something to read or measure by, never the value
    const opened = veil.figure(seal.tally({ amount: 1 }), (value) => value, { amount: 0 })
    expect([drawn, mixed, figured, opened]).toHaveLength(4)
  })
})
