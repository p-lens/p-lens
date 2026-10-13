import { describe, expect, test } from "bun:test"

import { leadingGraphemesOf } from "../../src/core/text/leading-graphemes"

describe("the first characters a person sees", () => {
  test("are letters, or pictures of one code point, as they are", () => {
    expect(leadingGraphemesOf("マイ帳簿", 1)).toBe("マ")
    expect(leadingGraphemesOf("マイ帳簿", 2)).toBe("マイ")
    expect(leadingGraphemesOf("🗿マイ帳簿", 1)).toBe("🗿")
    expect(leadingGraphemesOf("💙マイ帳簿", 2)).toBe("💙マ")
  })

  test("keep whole a picture joined of several code points: a flag, a family, a skin tone, a heart with its colour", () => {
    expect(leadingGraphemesOf("🇯🇵日本", 1)).toBe("🇯🇵")
    expect(leadingGraphemesOf("👨‍👩‍👧家計", 1)).toBe("👨‍👩‍👧")
    expect(leadingGraphemesOf("👍🏽よし", 1)).toBe("👍🏽")
    expect(leadingGraphemesOf("❤️赤", 2)).toBe("❤️赤")
    expect(leadingGraphemesOf("🇯🇵🗿", 2)).toBe("🇯🇵🗿")
  })

  test("are as many as there are, where fewer than asked for", () => {
    expect(leadingGraphemesOf("帳", 2)).toBe("帳")
    expect(leadingGraphemesOf("", 1)).toBe("")
  })
})
