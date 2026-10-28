import { describe, expect, test } from "bun:test"

import { patchBetween } from "../../../src/core/change/patch"
import type { PachinkoDraft } from "../../../src/core/live-play/draft"
import { playLineEntryText, readPlayLineEntry, shownPlayOf, type PlayLineEntry, type ShownPlay } from "../../../src/core/play-line/entry"
import { standingsOf } from "../../../src/core/play-line/following"
import { readOnto, readShownText, showingOf, shownTextOf, type LineEntry, type Placed } from "../../../src/core/play-line/showing"
import { linesOf } from "../../../src/core/text/line-diff"
import { MALEHAN } from "../../support/values"
import { A, B, BOOK, DRAFT, PLAY, TODAY, claimed, lineOf, playAt, shown } from "../../support/play-line"

const reading = (index: number): string => `{"spins":${index * 20},"outlay":${index * 1000}}`

/** The play with `count` readings and an operation in its history for each after the first: as long as a play typed into all evening. */
const playOf = (count: number, handovers?: number): ShownPlay =>
  shownPlayOf(
    {
      ...DRAFT,
      log: `${Array.from({ length: count }, (_, index) => reading(index)).join("\n")}\n`,
      history: Array.from({ length: count - 1 }, (_, index) => ({ at: `2026-10-28T01:${String(index % 60).padStart(2, "0")}:00.000Z`, removed: [], added: [reading(index + 1)] })),
      ...(handovers === undefined ? {} : { handovers }),
    },
    BOOK,
  )

const RICH: PachinkoDraft = {
  ...DRAFT,
  venue: { type: "parlor", parlor: MALEHAN, terms: { rental: { yen: 1000, tokens: 250 }, exchange: { yen: 1000, tokens: 280 }, replay: { paidOut: 250, deducted: 250 } } },
  cabinetNumber: "123",
  log: `${reading(0)}\n${reading(1)}\n`,
  history: [{ at: "2026-10-28T01:10:00.000Z", removed: [], added: [reading(1)] }],
  recorded: { at: "2026-10-28T03:00:10.000Z", finish: { at: "2026-10-28T03:00:00.000Z", counter: 300 } },
  received: { sender: "ミサト", senderId: "grant-1", log: `${reading(0)}\n`, finished: undefined },
  handovers: 2,
}

const placed = (entries: readonly PlayLineEntry[]): readonly Placed<PlayLineEntry>[] => entries.map((entry, index) => ({ seq: index + 1, entry }))

interface Written {
  readonly written: readonly Placed<PlayLineEntry>[]
  readonly read: readonly Placed<LineEntry>[]
}

/** A play shown on a line again and again by one device: the entries it puts there, each written against what the line has by then, and the line as read. */
const inTurn = (plays: readonly ShownPlay[], by = A): Written =>
  plays.reduce<Written>(
    (so, play, index) => {
      const put = { seq: so.written.length + 1, entry: showingOf(so.read, by, `t${index}`, play) }
      return { written: [...so.written, put], read: readOnto(so.read, [put]) }
    },
    { written: [], read: [] },
  )

const shownInTurn = (plays: readonly ShownPlay[], by = A): readonly Placed<LineEntry>[] => inTurn(plays, by).read

const playsOn = (line: readonly Placed<LineEntry>[]): readonly (ShownPlay | undefined)[] => line.map(({ entry }) => (entry.type === "shown" || entry.type === "patched" ? entry.play : undefined))

describe("a play shown, as text", () => {
  test("reads back as the play it is, every part of it", () => {
    const play = shownPlayOf(RICH, BOOK)
    expect(readShownText(shownTextOf(play))).toEqual(play)
    expect(readShownText(shownTextOf(playOf(1)))).toEqual(playOf(1))
  })

  test("has a line for each reading of its log and each operation of its history, so a reading put in changes a line of each", () => {
    const text = shownTextOf(playOf(200))
    expect(linesOf(text).filter((line) => line.startsWith("log>"))).toHaveLength(201)
    expect(linesOf(text).filter((line) => line.startsWith("history+"))).toHaveLength(199)
    const { hunks } = patchBetween(PLAY, text, shownTextOf(playOf(201)))
    expect(hunks.flatMap((hunk) => [...hunk.removed, ...hunk.added])).toEqual([`history+${JSON.stringify(playOf(201).history?.at(-1))}`, `log>${reading(200)}`])
  })

  test("is the same whichever order the play's parts were put in", () => {
    const play = shownPlayOf(RICH, BOOK)
    const reversed = Object.fromEntries(Object.entries(play).toReversed()) as ShownPlay
    expect(shownTextOf(reversed)).toBe(shownTextOf(play))
  })

  test("reads back whatever its text holds, U+2028, U+2029 and a carriage return in a name, a cabinet's number and a reading", () => {
    const odd = shownPlayOf({ ...RICH, machine: "P北斗\u2028無双", cabinetNumber: "12\u20293", log: `${reading(0)}\n{"spins":110,"event":{"kind":"jackpot","bonus":{"name":"20R\u2028確変\u2029","payout":3000,"spent":200,"jackpots":2}}}\r\n` }, BOOK)
    expect(readShownText(shownTextOf(odd))).toEqual(odd)
  })

  test("orders its parts by their names' code units, not by a locale's collation", () => {
    const names = linesOf(shownTextOf(shownPlayOf(RICH, BOOK))).map((line) => /^[A-Za-z]+/.exec(line)?.[0] ?? "")
    const unique = names.filter((name, index) => names[index - 1] !== name)
    expect(unique).toEqual(unique.toSorted())
    expect(unique.indexOf("bookId")).toBeLessThan(unique.indexOf("id"))
  })

  test("reads as no play where a part is said twice, a whole value spans two lines, a line is no part's, or the play does not read", () => {
    const lines = linesOf(shownTextOf(playOf(2)))
    const machine = lines.find((line) => line.startsWith("machine=")) ?? ""
    const refused = [
      [...lines, machine],
      [...lines.filter((line) => line !== machine), machine, machine],
      [...lines, "not a part"],
      lines.map((line) => (line.startsWith("date=") ? 'date="soon"' : line)),
      lines.map((line) => (line.startsWith("machine=") ? "machine={" : line)),
    ]
    refused.forEach((each) => expect(readShownText(each.join("\n"))).toBeUndefined())
  })
})

describe("a play shown again and again on a line", () => {
  test("goes whole the first time, then as patches of the showing before, which read as the plays shown", () => {
    const plays = [playOf(1), playOf(2), playOf(3), playOf(4)]
    const line = shownInTurn(plays)
    expect(line.map(({ entry }) => entry.type)).toEqual(["shown", "patched", "patched", "patched"])
    expect(playsOn(line)).toEqual(plays)
  })

  test("goes whole again at another handover than it was last shown at: the play taken up once more", () => {
    const line = shownInTurn([playOf(1), playOf(2), playOf(3, 1)])
    expect(line.map(({ entry }) => entry.type)).toEqual(["shown", "patched", "shown"])
  })

  test("goes whole again after nineteen patches in a row, so that a device that missed one is not kept waiting long", () => {
    const line = shownInTurn(Array.from({ length: 41 }, (_, index) => playOf(index + 1)))
    expect(line.flatMap(({ seq, entry }) => (entry.type === "shown" ? [seq] : []))).toEqual([1, 21, 41])
  })

  test("goes whole where a patch would come to no less than the play", () => {
    const base = playOf(1)
    const changed = { ...base, machine: "x".repeat(10), startedAt: "2026-10-28T09:00:00.000Z", log: `${reading(7)}\n` }
    expect(showingOf(shownInTurn([base]), A, "t1", changed).type).toBe("shown")
  })

  test("goes as patches that read, and whole again after nineteen, where its machine's name holds U+2028 or U+2029", () => {
    const odd = (count: number): ShownPlay => ({ ...playOf(count), machine: "P北斗\u2028無\u2029双" })
    const { written, read } = inTurn(Array.from({ length: 21 }, (_, index) => odd(index + 1)))
    expect(written.map(({ entry }) => entry.type)).toEqual(["shown", ...Array.from({ length: 19 }, () => "patched" as const), "shown"])
    expect(playsOn(read)).toEqual(Array.from({ length: 21 }, (_, index) => odd(index + 1)))
  })

  test("is patched only on a showing of its own device: another device's showing of it is no base", () => {
    const line = shownInTurn([playOf(1)], B)
    expect(showingOf(line, A, "t1", playOf(2)).type).toBe("shown")
  })
})

describe("a patch read onto a line", () => {
  const whole: PlayLineEntry = { type: "shown", by: A, at: "t0", play: playOf(1) }
  const patchOf = (on: number, before: ShownPlay, after: ShownPlay, by = A): PlayLineEntry => ({ type: "patched", by, at: "t1", playId: PLAY, on, hunks: patchBetween(PLAY, shownTextOf(before), shownTextOf(after)).hunks })

  test("is passed over where the place it names is not its device's showing of the play", () => {
    expect(readOnto([], placed([whole, patchOf(2, playOf(1), playOf(2))])).map(({ entry }) => entry.type)).toEqual(["shown"])
    expect(readOnto([], placed([whole, patchOf(1, playOf(1), playOf(2), B)])).map(({ entry }) => entry.type)).toEqual(["shown"])
    expect(readOnto([], placed([whole, claimed(B, "t1"), patchOf(2, playOf(1), playOf(2))])).map(({ entry }) => entry.type)).toEqual(["shown", "claimed"])
  })

  test("is passed over where the text it is made on does not hold what it takes away", () => {
    expect(readOnto([], placed([whole, patchOf(1, playOf(3), { ...playOf(3), machine: "other" })])).map(({ entry }) => entry.type)).toEqual(["shown"])
  })

  test("missed, leaves every patch after it unread until the play is shown whole again", () => {
    const { written } = inTurn(Array.from({ length: 22 }, (_, index) => playOf(index + 1)))
    const missed = readOnto([], written.filter(({ seq }) => seq !== 3))
    expect(missed.map(({ seq }) => seq)).toEqual([1, 2, 21, 22])
    expect(playsOn(missed)).toEqual([playOf(1), playOf(2), playOf(21), playOf(22)])
  })

  test("counts in the fold as the play it makes; one passed over leaves the play as it was last shown", () => {
    const patch = patchOf(1, playOf(1), playOf(3))
    expect(standingsOf([lineOf(BOOK, TODAY, [whole, patch])]).get(PLAY)).toEqual({ type: "held", by: A, handovers: 0, play: playOf(3), shownAt: "t1", line: { bookId: BOOK, day: TODAY } })
    expect(standingsOf([lineOf(BOOK, TODAY, [whole, patchOf(1, playOf(2), playOf(3))])]).get(PLAY)).toEqual({ type: "held", by: A, handovers: 0, play: playOf(1), shownAt: "t0", line: { bookId: BOOK, day: TODAY } })
    const handed = [shown(A, "t0", playAt(1)), claimed(B, "t1"), shown(B, "t2", playAt(2, BOOK, 1)), { type: "patched", by: A, at: "t3", playId: PLAY, on: 1, hunks: patchBetween(PLAY, shownTextOf(playAt(1)), shownTextOf(playAt(4))).hunks } as const]
    expect(standingsOf([lineOf(BOOK, TODAY, handed)]).get(PLAY)).toMatchObject({ type: "held", by: B, handovers: 1, play: playAt(2, BOOK, 1) })
  })
})

describe("a patch as a line's entry", () => {
  const patch: PlayLineEntry = { type: "patched", by: A, at: "t1", playId: PLAY, on: 3, hunks: [{ at: 4, removed: ["a"], added: ["b", "c"] }] }
  const fieldsOf = (entry: PlayLineEntry): Record<string, unknown> => JSON.parse(playLineEntryText(entry)) as Record<string, unknown>

  test("reads back as it was written, in format 2, while a whole showing is still written in format 1", () => {
    expect(readPlayLineEntry(playLineEntryText(patch))).toEqual(patch)
    expect(fieldsOf(patch)["format"]).toBe(2)
    expect(fieldsOf(shown(A, "t0"))["format"]).toBe(1)
  })

  test("is none in another format, with a part it does not know, at no place, or with a stretch that does not read", () => {
    const refused = [
      { ...fieldsOf(patch), format: 1 },
      { ...fieldsOf(shown(A, "t0")), format: 2 },
      { ...fieldsOf(patch), play: playOf(1) },
      { ...fieldsOf(patch), on: 0 },
      (({ on: _on, ...rest }) => rest)(fieldsOf(patch)),
      { ...fieldsOf(patch), hunks: [{ at: -1, removed: [], added: [] }] },
      { ...fieldsOf(patch), hunks: [{ at: 0, removed: [1], added: [] }] },
    ]
    refused.forEach((fields) => expect(readPlayLineEntry(JSON.stringify(fields))).toBeUndefined())
  })
})
