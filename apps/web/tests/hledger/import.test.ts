import { describe, expect, test } from "bun:test"

import { loadActivity } from "../../src/application/activity"
import { createBookSession } from "../../src/application/book-session"
import { importPrecord, previewPrecord, type ImportPorts } from "../../src/application/import"
import { loadOverview } from "../../src/application/overview"
import { loadTallies } from "../../src/application/tallies"
import { loadRecordedTally } from "../../src/application/revise-tally"
import type { BookId } from "../../src/core/book/book"
import { toPlainString } from "../../src/core/decimal/decimal"
import { Ok } from "../../src/core/result/result"
import { createMemoryHistory } from "../../src/history/adapters/memory-history"
import { ME, fixtureBook, inProcessHledger, memoryStorage } from "../support/in-process"
import { saidIn } from "../support/values"

const BOOK = "import" as BookId

const FILE = [
  "日付,店舗コード,店舗,メーカー,機種コード,機種,台番号,投資額,回収額,収支,メモ,稼働時間,時給,貯玉",
  "2019/01/05,S1,駅前ホール,メーカーA,M1,ピエロット,45,10000,0,-10000,,,,",
  '2019/01/02,S1,駅前ホール,メーカーB,M2,昔の台,123,12000,20000,8000,"朝イチ, 並んだ",,,',
  "",
].join("\r\n")

const setUp = async () => {
  const storage = memoryStorage()
  const history = createMemoryHistory(() => crypto.randomUUID())
  const session = createBookSession({ hledger: await inProcessHledger(), storage, history, clock: () => new Date("2026-10-09T20:00:00+09:00"), newId: () => crypto.randomUUID(), member: ME })
  await session.createBook(await fixtureBook("basic-play", { id: BOOK, members: [{ id: ME, displayName: "me", role: "owner" }] }))
  const machines = { pachinko: ["森物語"], pachislot: ["ピエロット"] }
  const ports: ImportPorts = { session, catalog: { search: async (_query: string, gameKind: "pachinko" | "pachislot") => Ok(machines[gameKind].map((name) => ({ id: name, gameKind, name, keywords: [] }))) } as never }
  return { session, history, ports }
}

describe("a pRecord file taken into a book", () => {
  test("adds its tallies, which hledger reads, to the results of their own days and to nothing else", async () => {
    const { session, ports } = await setUp()
    expect(await importPrecord(ports, BOOK, FILE, new Map(), undefined)).toEqual({ ok: true, value: { written: 2, inferred: 0, unread: 0, alreadyHere: 0 } })
    const month = await loadOverview(session, BOOK, "date:2019-01")
    expect(month.ok && [toPlainString(month.value.actual), toPlainString(month.value.savings)]).toEqual(["-2000", "68808"])
    const before = await loadOverview(session, BOOK, "date:2026-09")
    expect(before.ok && toPlainString(before.value.actual)).toBe("41142")
    const tallies = await loadTallies(session, BOOK, "date:2019", 0)
    expect(tallies.ok && tallies.value.tallies.map((tally) => [tally.date, tally.description, tally.gameKind, tally.machine, tally.cabinetNumber])).toEqual([
      ["2019-01-05", "駅前ホール | ピエロット 45番台", "slot", "ピエロット", "45"],
      ["2019-01-02", "駅前ホール | 昔の台 123番台", undefined, undefined, "123"],
    ] as never)
  })

  test("weighs its pachinko tallies of a catalogued machine — its name told from another writing of it by its spaces alone — that say their hours and took cash, where asked, and keeps what each was taken to be worth apart", async () => {
    const { session, ports } = await setUp()
    const file = [
      "日付,店舗コード,店舗,メーカー,機種コード,機種,台番号,投資額,回収額,収支,メモ,稼働時間,時給,貯玉",
      "2019/02/01,S1,駅前ホール,メーカーC,M3,森 物語,7,20000,0,-20000,,1.5,,",
      "2019/02/04,S1,駅前ホール,メーカーC,M3,森物語,7,0,9000,9000,,3,,",
      "2019/02/02,S1,駅前ホール,メーカーC,M3,森物語,8,10000,0,-10000,,,,",
      "2019/02/03,S1,駅前ホール,メーカーA,M1,ピエロット,9,5000,0,-5000,,2,,",
      "",
    ].join("\r\n")
    const formula = { id: "formula-1", figures: { roundChanceOneIn: 30, payoutPerRound: 140, totalChanceOneIn: undefined, spinsPerHour: undefined }, kind: "simulated", basis: { normalized: {}, conditions: {} } }
    const catalog = {
      search: async (_query: string, gameKind: "pachinko" | "pachislot") => Ok(gameKind === "pachinko" ? [{ id: "forest", gameKind, name: "森物語", keywords: [] }] : [{ id: "clown", gameKind, name: "ピエロット", keywords: [] }]),
      read: async (id: string) => Ok({ gameKind: "pachinko", machine: { id }, formulas: [{ formula, standing: { adoptions: 0, rejections: 0, uses: 0 } }] }),
    }
    const asked: { readonly seed: string; readonly trials: number; readonly hours: number }[] = []
    const engine = {
      infer: (order: { readonly seed: string; readonly trials: number; readonly told: { readonly hours: number } }, onEvent: (event: unknown) => void) => {
        asked.push({ seed: order.seed, trials: order.trials, hours: order.told.hours })
        onEvent({ type: "completed", summary: { trials: order.trials, planned: order.trials, finished: true, reading: { lower: 15, middle: 16, upper: 17, spins: 300, value: -15000, effectiveTrials: 1000 }, rarest: order.trials / 10, rarestWay: "result-at-most" } })
        return { cancel: () => undefined }
      },
    }
    const progress: (readonly [number, number])[] = []
    const taken = await importPrecord({ ...ports, catalog: catalog as never }, BOOK, file, new Map(), { engine: engine as never, onWeighed: (done, of) => void progress.push([done, of]) })
    expect(taken).toEqual({ ok: true, value: { written: 4, inferred: 1, unread: 0, alreadyHere: 0 } })
    expect(progress).toEqual([[0, 1], [1, 1]])
    expect(asked.map((each) => [each.trials, each.hours])).toEqual([[200_000, 1.5]])
    const tallies = await loadTallies(session, BOOK, "date:2019-02", 0)
    expect(tallies.ok && tallies.value.tallies.map((tally) => [tally.date, tally.inferredValue === undefined ? undefined : toPlainString(tally.inferredValue)])).toEqual([
      ["2019-02-04", undefined],
      ["2019-02-03", undefined],
      ["2019-02-02", undefined],
      ["2019-02-01", "-15000"],
    ] as never)
    const month = await loadOverview(session, BOOK, "date:2019-02")
    expect(month.ok && toPlainString(month.value.theoretical)).toBe("-15000")
    const again = await importPrecord({ ...ports, catalog: catalog as never }, BOOK, file, new Map(), { engine: engine as never, onWeighed: () => undefined })
    expect(again.ok).toBe(false)
    expect(asked.length).toBe(1)
  })

  test("is looked at before it is taken in: the tallies that say their hours, and the machines' names the catalog does not know", async () => {
    const file = [
      "日付,店舗,機種,投資額,回収額,稼働時間",
      "2019/03/01,駅前ホール,森 物語,1000,0,1.5",
      "2019/03/02,駅前ホール,もりものがたり,1000,0,",
      "2019/03/03,駅前ホール,知らない台,1000,0,2",
      "2019/03/04,駅前ホール,知らない台,1000,0,",
      "2019/03/05,駅前ホール,,1000,0,",
      "",
    ].join("\r\n")
    const catalog = { search: async (_query: string, gameKind: "pachinko" | "pachislot") => Ok(gameKind === "pachinko" ? [{ id: "forest", gameKind, name: "森物語", keywords: ["もりものがたり"] }] : [{ id: "clown", gameKind, name: "ピエロット", keywords: [] }]) }
    const preview = await previewPrecord({ catalog: catalog as never }, file)
    expect(preview.ok && [preview.value.told, preview.value.unnamed, preview.value.machines.map((machine) => machine.id)]).toEqual([2, [{ name: "知らない台", tallies: 2 }], ["forest", "clown"]] as never)
    expect(await previewPrecord({ catalog: catalog as never }, "日付,店舗\n2019/01/02,店\n")).toEqual({ ok: false, error: { type: "import", problem: { type: "not-precord", missing: ["投資額", "回収額"] } } })
  })

  test("ties a tally to the machine a person said its name is, and to one that goes by it as a search word", async () => {
    const { session, ports } = await setUp()
    const file = ["日付,店舗,機種,投資額,回収額", "2019/03/02,駅前ホール,もりものがたり,1000,0", "2019/03/03,駅前ホール,知らない台,1000,0", "2019/03/04,駅前ホール,別の知らない台,1000,0", ""].join("\r\n")
    const catalog = { search: async (_query: string, gameKind: "pachinko" | "pachislot") => Ok(gameKind === "pachinko" ? [{ id: "forest", gameKind, name: "森物語", keywords: ["もりものがたり"] }] : [{ id: "clown", gameKind, name: "ピエロット", keywords: [] }]) }
    expect((await importPrecord({ ...ports, catalog: catalog as never }, BOOK, file, new Map([["知らない台", "clown"]]), undefined)).ok).toBe(true)
    const tallies = await loadTallies(session, BOOK, "date:2019-03", 0)
    expect(tallies.ok && tallies.value.tallies.map((tally) => [tally.date, tally.gameKind, tally.machine])).toEqual([
      ["2019-03-04", undefined, undefined],
      ["2019-03-03", "slot", "ピエロット"],
      ["2019-03-02", "pachinko", "森物語"],
    ] as never)
  })

  test("writes nothing the second time, and says so", async () => {
    const { ports, history, session } = await setUp()
    await importPrecord(ports, BOOK, FILE, new Map(), undefined)
    expect(await importPrecord(ports, BOOK, FILE, new Map(), undefined)).toEqual({ ok: false, error: { type: "import", problem: { type: "nothing-new", count: 2 } } })
    const more = `${FILE}2019/02/01,,別の店,,,,,3000,9000,6000,,,,\r\n`
    expect(await importPrecord(ports, BOOK, more, new Map(), undefined)).toEqual({ ok: true, value: { written: 1, inferred: 0, unread: 0, alreadyHere: 2 } })
    const activity = await loadActivity(session, history, BOOK)
    expect(activity.ok && activity.value.lines.map((line) => [line.did, saidIn(line.parts)]).slice(-2)).toEqual([
      ["plays-imported", { imported: { from: "precord", count: 2 } }],
      ["plays-imported", { imported: { from: "precord", count: 1 } }],
    ])
  })

  test("is not set right in a form, which holds neither its two sides nor the source's names", async () => {
    const { session, ports } = await setUp()
    await importPrecord(ports, BOOK, FILE, new Map(), undefined)
    const tallies = await loadTallies(session, BOOK, "date:2019-01-05", 0)
    const id = tallies.ok ? tallies.value.tallies[0]?.id : undefined
    expect(await loadRecordedTally(session, BOOK, ME, id as never)).toEqual({ ok: false, error: { type: "tally-unreadable" } })
  })

  test("takes nothing in from a file with a row that does not read", async () => {
    const { session, ports } = await setUp()
    expect(await importPrecord(ports, BOOK, `${FILE}いつか,,,,,,,1,1,0,,,,\r\n`, new Map(), undefined)).toEqual({ ok: false, error: { type: "import", problem: { type: "rows-unreadable", rows: [{ line: 4, fields: ["date"] }] } } })
    const tallies = await loadTallies(session, BOOK, "date:2019", 0)
    expect(tallies.ok && tallies.value.total).toBe(0)
  })
})
