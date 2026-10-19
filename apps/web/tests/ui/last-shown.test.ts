import { describe, expect, test } from "bun:test"

import { Err, Ok } from "../../src/core/result/result"
import { createLastShown } from "../../src/ui/features/holdings/shown"

describe("what a screen last showed", () => {
  test("is what was last answered for the key, and nothing for a key never answered or answered with an error", async () => {
    const shown = createLastShown<number>()
    await shown.asked("a", async () => Ok(1))
    await shown.asked("b", async () => Err({ type: "tally-missing" }))
    expect([shown.kept("a"), shown.kept("b"), shown.kept("c")]).toEqual([Ok(1), undefined, undefined])
  })

  test("is asked again, each key the way it was last asked, and kept as answered then", async () => {
    const shown = createLastShown<number>()
    const book = { holds: 1 }
    await shown.asked("a", async () => Ok(book.holds))
    book.holds = 2
    expect(shown.kept("a")).toEqual(Ok(1))
    await shown.askAgain()
    expect(shown.kept("a")).toEqual(Ok(2))
  })

  test("keeps the six asked last, letting the oldest go", async () => {
    const shown = createLastShown<number>()
    await ["a", "b", "c", "d", "e", "f", "g"].reduce((before, key, at) => before.then(async () => void (await shown.asked(key, async () => Ok(at)))), Promise.resolve())
    expect([shown.kept("a"), shown.kept("b"), shown.kept("g")]).toEqual([undefined, Ok(1), Ok(6)])
  })
})
