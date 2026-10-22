import { describe, expect, test } from "bun:test"

import { huddleNameOf } from "../../src/core/huddle/huddle"
import { HUDDLE_BEAST_SHARE, HUDDLE_JOKE_NAMES, HUDDLE_JOKE_SHARE, HUDDLE_NAME_ANIMALS, HUDDLE_NAME_BEASTS, HUDDLE_NAME_MOODS, suggestedHuddleName } from "../../src/ui/wording/huddle-names"

/** A random source that gives back `draws` in turn. */
const drawing = (draws: readonly number[]): (() => number) => {
  const held: { next: number } = { next: 0 }
  return () => draws[held.next++] ?? 0
}

/** Every draw a plain name can come from: each mood, animals or beasts, and fractions all along the list. */
const plainDraws = HUDDLE_NAME_MOODS.flatMap((_, mood) =>
  [HUDDLE_JOKE_SHARE, HUDDLE_JOKE_SHARE + HUDDLE_BEAST_SHARE].flatMap((kinds) => Array.from({ length: 100 }, (_, kind) => [kinds, (mood + 0.5) / HUDDLE_NAME_MOODS.length, kind / 100])),
)

/** How many of `kinds` fit beside `mood` in a name. */
const fittingBeside = (mood: string, kinds: readonly string[]): number => kinds.filter((kind) => huddleNameOf(`${mood}${kind}`) === `${mood}${kind}`).length

describe("huddle name suggestions", () => {
  test("each joke is a name a huddle takes as it is", () => {
    expect(HUDDLE_JOKE_NAMES.filter((name) => huddleNameOf(name) !== name)).toEqual([])
  })

  test("every plain name drawn is one a huddle takes as it is, however long its mood", () => {
    expect(plainDraws.map((draws) => suggestedHuddleName(drawing(draws))).filter((name) => huddleNameOf(name) !== name)).toEqual([])
  })

  test("every mood has an animal and a beast that fit beside it", () => {
    expect(HUDDLE_NAME_MOODS.filter((mood) => fittingBeside(mood, HUDDLE_NAME_ANIMALS) === 0 || fittingBeside(mood, HUDDLE_NAME_BEASTS) === 0)).toEqual([])
  })

  test("nothing is offered twice", () => {
    expect(new Set(HUDDLE_JOKE_NAMES).size).toBe(HUDDLE_JOKE_NAMES.length)
    expect(new Set(HUDDLE_NAME_MOODS).size).toBe(HUDDLE_NAME_MOODS.length)
    expect(new Set([...HUDDLE_NAME_ANIMALS, ...HUDDLE_NAME_BEASTS]).size).toBe(HUDDLE_NAME_ANIMALS.length + HUDDLE_NAME_BEASTS.length)
  })

  test("a first draw under the joke share gives a joke, from either end of the list", () => {
    expect(suggestedHuddleName(drawing([0, 0]))).toBe(HUDDLE_JOKE_NAMES.at(0) ?? "")
    expect(suggestedHuddleName(drawing([HUDDLE_JOKE_SHARE - 0.000_001, 0.999_999]))).toBe(HUDDLE_JOKE_NAMES.at(-1) ?? "")
  })

  test("a first draw past both shares gives a mood and an animal", () => {
    expect(suggestedHuddleName(drawing([HUDDLE_JOKE_SHARE + HUDDLE_BEAST_SHARE, 0, 0]))).toBe(`${HUDDLE_NAME_MOODS.at(0) ?? ""}${HUDDLE_NAME_ANIMALS.at(0) ?? ""}`)
    expect(suggestedHuddleName(drawing([0.999_999, 0.999_999, 0.999_999]))).toBe(`${HUDDLE_NAME_MOODS.at(-1) ?? ""}${HUDDLE_NAME_ANIMALS.at(-1) ?? ""}`)
  })

  test("a first draw within the beast share gives a mood and a beast", () => {
    expect(suggestedHuddleName(drawing([HUDDLE_JOKE_SHARE, 0, 0]))).toBe(`${HUDDLE_NAME_MOODS.at(0) ?? ""}${HUDDLE_NAME_BEASTS.at(0) ?? ""}`)
    expect(suggestedHuddleName(drawing([HUDDLE_JOKE_SHARE + HUDDLE_BEAST_SHARE - 0.000_001, 0, 0.999_999]))).toBe(`${HUDDLE_NAME_MOODS.at(0) ?? ""}${HUDDLE_NAME_BEASTS.at(-1) ?? ""}`)
  })
})
