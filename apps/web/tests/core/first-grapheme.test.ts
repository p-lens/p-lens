import { describe, expect, test } from "bun:test"

import { firstGraphemeOf } from "../../src/core/text/first-grapheme"

describe("the first character a person sees", () => {
  test("is a letter or a picture of one code point as it is", () => {
    expect(firstGraphemeOf("マイ帳簿")).toBe("マ")
    expect(firstGraphemeOf("🗿マイ帳簿")).toBe("🗿")
    expect(firstGraphemeOf("💙マイ帳簿")).toBe("💙")
  })

  test("is a picture joined of several code points whole: a flag, a family, a skin tone, a heart with its colour", () => {
    expect(firstGraphemeOf("🇯🇵日本")).toBe("🇯🇵")
    expect(firstGraphemeOf("👨‍👩‍👧家計")).toBe("👨‍👩‍👧")
    expect(firstGraphemeOf("👍🏽よし")).toBe("👍🏽")
    expect(firstGraphemeOf("❤️赤")).toBe("❤️")
  })

  test("is none in an empty text", () => {
    expect(firstGraphemeOf("")).toBeUndefined()
  })
})
