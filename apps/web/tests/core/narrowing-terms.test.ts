import { describe, expect, test } from "bun:test"

import { UNSENT } from "../../src/core/report/senders"
import { savingsAtTerm, sendersTerm } from "../../src/hledger/query/terms"

const OFFERED = [UNSENT, "grant-a", "grant-b.c"] as const

describe("the tallies of some of those who played a book", () => {
  test("are the chosen senders' alone where the book's own tallies are left out", () => {
    expect(sendersTerm(["grant-a"], OFFERED)).toBe("tag:^sender-id$=^(grant-a)$")
    expect(sendersTerm(["grant-a", "grant-b.c"], OFFERED)).toBe("tag:^sender-id$=^(grant-a|grant-b\\.c)$")
  })

  test("are every tally but the senders left out where the book's own are chosen, and every tally where none is", () => {
    expect(sendersTerm([UNSENT, "grant-a"], OFFERED)).toBe("not:tag:^sender-id$=^(grant-b\\.c)$")
    expect(sendersTerm([UNSENT], OFFERED)).toBe("not:tag:^sender-id$=^(grant-a|grant-b\\.c)$")
    expect(sendersTerm([...OFFERED], OFFERED)).toBe("")
  })

  test("are nothing at all, and nothing asked, where nobody is chosen", () => {
    expect(sendersTerm([], OFFERED)).toBeUndefined()
  })
})

describe("the savings of some parlors", () => {
  test("are their accounts of either kind of token, quoted for a name with a space", () => {
    expect(savingsAtTerm(["A店", "B 店"])).toBe('"^(資産:貯玉|資産:貯メダル):(A店|B 店):"')
    expect(savingsAtTerm(['C"店'])).toBe('"^(資産:貯玉|資産:貯メダル):(C.店):"')
  })

  test("are nothing at all where no parlor is named", () => {
    expect(savingsAtTerm([])).toBeUndefined()
  })
})
