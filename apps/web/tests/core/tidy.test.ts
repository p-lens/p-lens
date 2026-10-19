import { describe, expect, test } from "bun:test"

import { tidyTyped } from "../../src/core/text/tidy"

describe("typed text as it is kept", () => {
  test("full-width spaces, brackets and underscores become half-width, and the ends are trimmed", () => {
    expect(tidyTyped("　Ｐ流星の剣（強敵）＿ＬＴ　")).toBe("P流星の剣(強敵)_LT")
  })

  test("runs of spaces of any kind become one", () => {
    expect(tidyTyped("e 流星の剣　　 10 ​キングモデル")).toBe("e 流星の剣 10 キングモデル")
  })

  test("full-width digits and signs read as numbers", () => {
    expect(tidyTyped("１，０００")).toBe("1,000")
    expect(tidyTyped("３１９．７")).toBe("319.7")
    expect(tidyTyped("－５００")).toBe("-500")
    expect(tidyTyped("−500")).toBe("-500")
  })

  test("half-width kana become full-width, voiced marks joined", () => {
    expect(tidyTyped("ｸﾞﾘﾌﾟﾝ ﾀﾞｲﾅﾓ")).toBe("グリプン ダイナモ")
  })

  test("kanji, kana and the long vowel are left as typed", () => {
    expect(tidyTyped("森物語〜ジャパンー")).toBe("森物語〜ジャパンー")
  })
})
