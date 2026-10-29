import { describe, expect, test } from "bun:test"

import { importedText, timeLeftText } from "../../src/ui/wording/import"
import { exportReportText } from "../../src/ui/wording/export"

describe("a taking in, as a person is told", () => {
  test("says what was written, weighed, and left unweighed by a stop, which the same file chosen again goes on from", () => {
    expect(importedText({ written: 30, alreadyHere: 0, inferred: 12, unread: 1, changed: 0, left: 5 })).toBe("30件を取り込みました。うち12件に推定期待値をつけました。推論できず1件。中止したため、5件は推定していません。同じファイルをもう一度選ぶと、続きから推定します。")
    expect(importedText({ written: 0, alreadyHere: 30, inferred: 5, unread: 0, changed: 0, left: 0 })).toBe("30件はすべて取り込み済みです。5件に推定期待値をつけました。")
    expect(importedText({ written: 0, alreadyHere: 3, inferred: 0, unread: 0, changed: 2, left: 0 })).toBe("3件はすべて取り込み済みです。2件は取り込み後に書き換わっていたため、推定期待値をつけていません。")
  })

  test("says about how long a weighing has left, in minutes, and in hours past an hour", () => {
    expect(timeLeftText(20)).toBe("あと1分足らず")
    expect(timeLeftText(61)).toBe("あと約2分")
    expect(timeLeftText(3_600)).toBe("あと約1時間")
    expect(timeLeftText(5_400)).toBe("あと約1時間30分")
  })
})

describe("a file being made, as a person is told", () => {
  test("says the stage of one book, and how many of several are done", () => {
    expect(exportReportText({ type: "totalling" })).toBe("収支を集計中…")
    expect(exportReportText({ type: "book", done: 3, of: 12 })).toBe("書き出し中… 3/12冊")
  })
})
