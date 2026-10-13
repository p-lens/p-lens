import { describe, expect, test } from "bun:test"

import { TITLE_PICTURES, unnamedTitle } from "../../../src/core/book/unnamed-title"
import { leadingGraphemesOf } from "../../../src/core/text/leading-graphemes"

describe("the pictures a book nobody has named is told apart by", () => {
  test("are many, each once, each one code point", () => {
    expect(TITLE_PICTURES.length).toBeGreaterThanOrEqual(200)
    expect(new Set(TITLE_PICTURES).size).toBe(TITLE_PICTURES.length)
    expect(TITLE_PICTURES.filter((picture) => [...picture].length !== 1)).toEqual([])
  })

  test("hold no heart, and nothing a person is: a face or a hand", () => {
    expect(TITLE_PICTURES.filter((picture) => /[\u{1F493}-\u{1F49F}\u{2764}\u{1F5A4}\u{1F90D}\u{1F90E}\u{1F9E1}\u{1F600}-\u{1F64F}\u{1F440}-\u{1F450}\u{1F464}-\u{1F487}\u{1F90C}-\u{1F93A}\u{1F9D0}-\u{1F9DF}\u{1F1E6}-\u{1F1FF}]/u.test(picture))).toEqual([])
  })
})

describe("a title for a book nobody has named", () => {
  test("is a picture and マイ帳簿, the picture said by the number drawn", () => {
    expect(unnamedTitle([], 0)).toBe(`${TITLE_PICTURES[0]}マイ帳簿`)
    expect(unnamedTitle([], 0.999999)).toBe(`${TITLE_PICTURES.at(-1)}マイ帳簿`)
    expect(unnamedTitle([], 1)).toBe(`${TITLE_PICTURES.at(-1)}マイ帳簿`)
  })

  test("begins with no picture a book there begins with, whatever is drawn", () => {
    const taken = [`${TITLE_PICTURES[0]}マイ帳簿`, ` ${TITLE_PICTURES[1]}ノリ打ち`, "マイ帳簿"]
    const drawn = Array.from({ length: 500 }, (_, index) => leadingGraphemesOf(unnamedTitle(taken, index / 500), 1))
    expect(drawn.includes(TITLE_PICTURES[0] ?? "")).toBe(false)
    expect(drawn.includes(TITLE_PICTURES[1] ?? "")).toBe(false)
    expect(new Set(drawn).size).toBe(TITLE_PICTURES.length - 2)
  })

  test("a dozen made one after another are a dozen pictures", () => {
    const made = Array.from({ length: 12 }).reduce<readonly string[]>((titles) => [...titles, unnamedTitle(titles, 0.5)], [])
    expect(new Set(made.map((title) => leadingGraphemesOf(title, 1))).size).toBe(12)
  })

  test("is still a picture and マイ帳簿 where every picture is taken", () => {
    expect(unnamedTitle(TITLE_PICTURES.map((picture) => `${picture}帳簿`), 0)).toBe(`${TITLE_PICTURES[0]}マイ帳簿`)
  })
})
