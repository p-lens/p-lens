import { describe, expect, test } from "bun:test"

import { firstBook } from "../../src/app/composition/first-book"
import { createBookSession } from "../../src/application/book-session"
import type { DeletionPorts } from "../../src/application/delete-book"
import { makeSampleBook, type SamplePorts, type SampleReport } from "../../src/application/sample-book/make-sample-book"
import type { Catalog } from "../../src/catalog/port/catalog"
import type { BookId } from "../../src/core/book/book"
import type { IsoDate } from "../../src/core/calendar/calendar"
import { DEFAULT_BUSINESS_DAY_TURN } from "../../src/core/calendar/calendar"
import type { MachineEntry, MachineSummary } from "../../src/core/catalog/catalog"
import type { MachineId } from "../../src/core/machine/machine"
import { BOOK_FILES } from "../../src/core/journal/layout"
import { Err, Ok } from "../../src/core/result/result"
import { createMemoryHistory } from "../../src/history/adapters/memory-history"
import { ME, inProcessHledger, memoryDrafts, memoryStorage, transactionsOf } from "../support/in-process"
import { LINEUP, PARLOR_LIST } from "./fixtures"
import { inProcessMaker } from "./in-process-maker"

const summaryOf = (
  machine: {
    readonly id: string
    readonly name: string
    readonly releasedOn: IsoDate
  },
  gameKind: MachineSummary["gameKind"],
): MachineSummary => ({
  id: machine.id as MachineId,
  gameKind,
  name: machine.name,
  modelName: undefined,
  keywords: [],
  hitChance: undefined,
  formulaHitChances: [],
  releasedOn: machine.releasedOn,
  formulaCount: 1,
})

const SUMMARIES: readonly MachineSummary[] = [...LINEUP.pachinko.map((machine) => summaryOf(machine, "pachinko")), ...LINEUP.slot.map((machine) => summaryOf(machine, "pachislot"))]

const entryOf = (id: string): MachineEntry | undefined => {
  const summary = SUMMARIES.find((machine) => machine.id === id)
  const pachinko = LINEUP.pachinko.find((machine) => machine.id === id)
  const slot = LINEUP.slot.find((machine) => machine.id === id)
  if (summary === undefined) return undefined
  if (pachinko !== undefined)
    return {
      gameKind: "pachinko",
      machine: summary,
      formulas: [{ formula: { figures: pachinko.seat.figures }, standing: {} }],
    } as never
  if (slot !== undefined)
    return {
      gameKind: "pachislot",
      machine: summary,
      formulas: [{ formula: { figures: slot.seat.levels }, standing: {} }],
      distributions: [],
    } as never
  return undefined
}

const CATALOG = {
  search: async (_: string, gameKind: MachineSummary["gameKind"]) => Ok(SUMMARIES.filter((machine) => machine.gameKind === gameKind)),
  read: async (id: string) => ((entry) => (entry === undefined ? Err({ type: "machine-missing" as const, id }) : Ok(entry)))(entryOf(id)),
} as unknown as Catalog

const setUp = async () => {
  const storage = memoryStorage()
  const history = createMemoryHistory(() => crypto.randomUUID())
  const session = createBookSession({
    hledger: await inProcessHledger(),
    storage,
    history,
    clock: () => new Date("2025-06-30T12:00:00+09:00"),
    newId: () => crypto.randomUUID(),
    member: ME,
  })
  const ports: SamplePorts = {
    session,
    maker: inProcessMaker(),
    catalog: CATALOG,
    parlors: { list: async () => Ok({ parlors: PARLOR_LIST, rejections: [] }) },
    locate: async () => Ok({ latitude: 35.6, longitude: 139.7 }),
    deletion: {
      storage,
      history,
      drafts: memoryDrafts(),
    } as unknown as DeletionPorts,
  }
  return { storage, session, ports }
}

describe("a sample book made", () => {
  test("is three years of plays written one year a commit, every one of them tried in hledger", async () => {
    const { storage, session, ports } = await setUp()
    const reports: SampleReport[] = []
    const made = await makeSampleBook(
      ports,
      {
        title: "🍀サンプル帳簿",
        fresh: firstBook("sample" as BookId, ME, "マイ帳簿"),
        businessDayTurn: DEFAULT_BUSINESS_DAY_TURN,
        through: "2025-06-30" as IsoDate,
        seed: "written",
      },
      {
        onReport: (report) => reports.push(report),
        pause: async () => undefined,
        stopped: new AbortController().signal,
      },
    )
    expect(made.ok && made.value.ok && made.value.value.type).toBe("made")
    const stored = storage.peek("sample" as BookId)
    const transactions = transactionsOf(stored?.files)
    expect(transactions.split("\n").filter((line) => line.includes("play-id:")).length).toBeGreaterThan(500)
    expect(transactions).toContain("景品交換")
    expect(stored?.files[BOOK_FILES.main]).toContain("🍀サンプル帳簿")
    expect(stored?.files[BOOK_FILES.prices]).toContain("P 2022-07-01")
    expect(reports.filter((report) => report.type === "writing").map((report) => report.done)).toEqual([0, 1, 2, 3])
    expect(reports.some((report) => report.type === "gathering")).toBe(true)
    expect(reports.slice(0, 2)).toEqual([{ type: "locating" }, { type: "placed", located: true, prefecture: "東京都", parlors: expect.any(Number) }])
    expect(reports.filter((report) => report.type === "making").at(-1)).toMatchObject({ type: "making" })
    expect((await session.books()).ok).toBe(true)
  }, 120_000)

  test("stops at once where the person stops it while its days are played, and leaves nothing", async () => {
    const { storage, ports } = await setUp()
    const making = new AbortController()
    const days: number[] = []
    const made = await makeSampleBook(
      ports,
      { title: "🍀サンプル帳簿", fresh: firstBook("halfway" as BookId, ME, "マイ帳簿"), businessDayTurn: DEFAULT_BUSINESS_DAY_TURN, through: "2025-06-30" as IsoDate, seed: "halfway" },
      {
        onReport: (report) => {
          if (report.type !== "making") return
          days.push(report.done)
          if (report.done === 5) making.abort()
        },
        pause: async () => undefined,
        stopped: making.signal,
      },
    )
    expect(made).toEqual(Ok(Ok({ type: "cancelled" })))
    expect(days.at(-1)).toBe(5)
    expect(storage.peek("halfway" as BookId)).toBeUndefined()
  })

  test("is nothing at all where the person stops it before it is written", async () => {
    const { storage, ports } = await setUp()
    const made = await makeSampleBook(
      ports,
      {
        title: "🍀サンプル帳簿",
        fresh: firstBook("stopped" as BookId, ME, "マイ帳簿"),
        businessDayTurn: DEFAULT_BUSINESS_DAY_TURN,
        through: "2025-06-30" as IsoDate,
        seed: "stopped",
      },
      {
        onReport: () => undefined,
        pause: async () => undefined,
        stopped: AbortSignal.abort(),
      },
    )
    expect(made).toEqual(Ok(Ok({ type: "cancelled" })))
    expect(storage.peek("stopped" as BookId)).toBeUndefined()
  })
})
