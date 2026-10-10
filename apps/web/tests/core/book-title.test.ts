import { describe, expect, test } from "bun:test"

import { titleOfMain } from "../../src/core/journal/title"

describe("a book's title, as its main journal gives it", () => {
  test("is read from the comments the journal opens with", () => {
    expect(titleOfMain("; A P-Lens book.\n; book-title-p: サンプル帳簿\n\ninclude accounts.journal\n")).toBe("サンプル帳簿")
    expect(titleOfMain(";book-title-p:  仲間の帳簿  \ninclude a.journal")).toBe("仲間の帳簿")
  })

  test("is none when the journal gives none, gives it empty, or gives it only after its directives begin", () => {
    expect(titleOfMain("; A P-Lens book.\ninclude accounts.journal\n")).toBeUndefined()
    expect(titleOfMain("; book-title-p:\ninclude a.journal")).toBeUndefined()
    expect(titleOfMain("include a.journal\n; book-title-p: 後ろの名前\n")).toBeUndefined()
  })
})
