import { describe, expect, test } from "bun:test"

import { UNSENT } from "../../src/core/report/senders"
import { savingsAtTerm, sendersTerm, taggedAmongTerm, playedTokensTerm } from "../../src/hledger/query/terms"

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

describe("the tallies carrying any of several tags with any of several values", () => {
  test("hold each tag's name and each value to the whole of it, quoted, a quote in a value matched by any letter", () => {
    expect(taggedAmongTerm(["machine", "source-machine"], ["台X", 'A "B" 店.'])).toBe('"tag:^(machine|source-machine)$=^(台X|A .B. 店\\.)$"')
  })
})

describe("the entries that played tokens of some rates", () => {
  test("are those with any posting whose commodity begins with the kind and rate, at whichever parlor", () => {
    expect(playedTokensTerm([{ kind: "ball", tier: "4円" }, { kind: "medal", tier: "21.7円" }])).toBe('any:"cur:^玉\\(4円・.*$|^枚\\(21\\.7円・.*$"')
    expect(playedTokensTerm([])).toBe('any:"cur:^$"')
  })
})
