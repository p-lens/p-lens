import { describe, expect, test } from "bun:test"

import { createBookSession } from "../../src/application/book-session"
import { keepingHistory } from "../../src/application/draft-history"
import { addCheckpoints, changeTerms, finishPlay, finishPlayInYen, loadDrafts, loadTodaysPlays, reviseCheckpoints, startPlay, theoreticalValueAtFinish } from "../../src/application/live-play"
import { linkSubmissions, openPool } from "../../src/application/parlors"
import { loadRecordingContext, recordTokenTally } from "../../src/application/record-tally"
import type { BookId } from "../../src/core/book/book"
import type { IsoDate } from "../../src/core/calendar/calendar"
import { isLeftOver, type PlayDraft } from "../../src/core/live-play/draft"
import type { ParlorId, SubmissionId } from "../../src/core/parlor/parlor"
import type { PlayId } from "../../src/core/play/play"
import { mapOk } from "../../src/core/result/result"
import { createMemoryHistory } from "../../src/history/adapters/memory-history"
import { ME, fixtureBook, inProcessHledger, memoryDrafts, memoryStorage, transactionsOf } from "../support/in-process"
import { RENTED_PLAY, MALEHAN, dec } from "../support/values"

const BOOK = "live" as BookId
const ID = "live-1" as PlayId

const DRAFT: PlayDraft = {
  id: ID,
  date: "2026-10-04" as IsoDate,
  venue: { type: "parlor", parlor: MALEHAN, terms: { rental: { yen: 1000, tokens: 250 }, exchange: { yen: 1000, tokens: 280 }, replay: { paidOut: 250, deducted: 275 } } },
  gameKind: "pachinko",
  machine: "流星",
  pachinko: undefined,
  cabinetNumber: "123",
  startedAt: "2026-10-04T12:00:00.000Z",
  log: '{"spins":0,"outlay":0,"counter":{"spins":120}}\n',
}

const setUp = async () => {
  const storage = memoryStorage()
  const drafts = memoryDrafts()
  await storage.createBook(await fixtureBook("basic-play", { id: BOOK, members: [{ id: ME, displayName: "me", role: "owner" }] }))
  const session = createBookSession({
    hledger: await inProcessHledger(),
    storage,
    history: createMemoryHistory(() => crypto.randomUUID()),
    clock: () => new Date("2026-10-04T20:00:00+09:00"),
    newId: () => crypto.randomUUID(), member: ME,
  })
  return { storage, drafts, session }
}

const RECORD = { ...RENTED_PLAY, id: ID, date: "2026-10-04" as IsoDate }

const FINISH = { at: "2026-10-04T14:30:00.000Z", counter: 150 }

const NOW = "2026-10-04T14:31:00.000Z"

describe("a play followed live", () => {
  test("keeps its readings as a draft, apart from the book", async () => {
    const { storage, drafts } = await setUp()
    await startPlay(drafts, DRAFT)
    const added = await addCheckpoints(drafts, DRAFT, [{ spins: 250, outlay: 1000 }])
    expect(mapOk(added, (draft) => draft.log)).toEqual({ ok: true, value: `${DRAFT.log}{"spins":250,"outlay":1000}\n` })
    expect(Object.keys(storage.peek(BOOK)?.files ?? {}).some((path) => path.endsWith(".jsonl"))).toBe(false)
  })

  test("refuses a reading written against a log another tab has since added to", async () => {
    const { drafts } = await setUp()
    await startPlay(drafts, DRAFT)
    await addCheckpoints(drafts, DRAFT, [{ spins: 250 }])
    expect(await addCheckpoints(drafts, DRAFT, [{ spins: 300 }])).toEqual({ ok: false, error: { type: "draft", error: { type: "changed-elsewhere", path: ID } } })
  })

  test("is recorded with its log beside the entry, and stays among the day's plays, marked as recorded", async () => {
    const { storage, drafts, session } = await setUp()
    await startPlay(drafts, DRAFT)
    const finished = await finishPlay(session, drafts, DRAFT, BOOK, RECORD, FINISH, NOW)
    expect(finished.ok).toBe(true)
    const [head = "", ...readings] = (storage.peek(BOOK)?.files[`pachinko-play/${ID}.jsonl`] ?? "").split("\n")
    expect(JSON.parse(head)).toEqual({
      header: true,
      about: "P-Lens play log. This first line is its header and says what the play was; every line after it is one reading of the play. The format is described at https://github.com/p-lens/p-lens.",
      v: 1,
      playId: ID,
      gameKind: "pachinko",
      date: "2026-10-04",
      startedAt: "2026-10-04T12:00:00.000Z",
      parlor: { name: "マレハン東京皇国第8支店", id: "malehan-tokyokoukoku" },
      terms: { rental: { yen: 1000, tokens: 250 }, exchange: { yen: 1000, tokens: 280 }, replay: { paidOut: 250, deducted: 275 } },
      machine: "流星",
      cabinetNumber: "123",
    })
    expect(readings.join("\n")).toBe(`${DRAFT.log}{"spins":30,"at":"2026-10-04T14:30:00.000Z","counter":{"spins":150},"held":4800,"event":{"kind":"finished"}}\n`)
    expect(transactionsOf(storage.peek(BOOK)?.files)).toContain("play-id: live-1")
    expect(mapOk(await loadTodaysPlays(drafts, "2026-10-04" as IsoDate), (found) => found.map((draft) => [draft.id, draft.recorded, draft.log]))).toEqual({ ok: true, value: [[ID, { at: NOW, finish: FINISH }, DRAFT.log]] })
  })

  test("is unknown to every book until it is recorded, when its parlor's pool is opened in the book it goes into", async () => {
    const { storage, drafts, session } = await setUp()
    const parlor = { identity: { type: "listed" as const, id: "osm-77" as never }, name: "新規店", pools: [{ kind: "ball" as const, tier: "4円" }] }
    const elsewhere: PlayDraft = { ...DRAFT, venue: { ...DRAFT.venue, type: "parlor", parlor, terms: DRAFT.venue.terms as never } }
    await startPlay(drafts, elsewhere)
    expect(storage.peek(BOOK)?.files["accounts.journal"]).not.toContain("新規店")
    expect((await finishPlay(session, drafts, elsewhere, BOOK, { ...RECORD, parlor }, FINISH, NOW)).ok).toBe(true)
    expect(storage.peek(BOOK)?.files["accounts.journal"]).toContain("資産:貯玉:新規店:4円")
    expect(mapOk(await loadDrafts(drafts), (found) => found.map((draft) => draft.bookId))).toEqual({ ok: true, value: [BOOK] })
  })

  test("started at no parlor, is recorded at one chosen as it is recorded: that parlor's pool opened on the play's terms, and its savings drawn on though they hold none", async () => {
    const { storage, drafts, session } = await setUp()
    const parlor = { identity: { type: "listed" as const, id: "osm-78" as never }, name: "選んだ店", pools: [{ kind: "ball" as const, tier: "4円" }] }
    const nowhere: PlayDraft = { ...DRAFT, venue: { type: "none", terms: DRAFT.venue.terms } }
    await startPlay(drafts, nowhere)
    const drawn = { ...RECORD, parlor, replay: { paidOut: dec("250"), deducted: dec("250") } }
    expect(await finishPlay(session, drafts, nowhere, BOOK, drawn, FINISH, NOW)).toEqual({ ok: true, value: expect.anything() })
    expect(storage.peek(BOOK)?.files["accounts.journal"]).toContain("資産:貯玉:選んだ店:4円")
    expect(storage.peek(BOOK)?.files["accounts.journal"]).not.toContain("簿外")
  })

  test("is put on other terms while it is played, its readings left as they are and no book told", async () => {
    const { storage, drafts } = await setUp()
    await startPlay(drafts, DRAFT)
    const before = JSON.stringify(storage.peek(BOOK)?.files)
    const oneYen = { rental: { yen: 1000, tokens: 1000 }, exchange: { yen: 1000, tokens: 1120 }, replay: { paidOut: 500, deducted: 500 } }
    const changed = await changeTerms(drafts, DRAFT, oneYen)
    expect(changed.ok && [changed.value.venue.terms, changed.value.log]).toEqual([oneYen, DRAFT.log])
    expect(mapOk(await loadDrafts(drafts), (found) => found.map((draft) => draft.venue.terms))).toEqual({ ok: true, value: [oneYen] })
    expect(JSON.stringify(storage.peek(BOOK)?.files)).toBe(before)
  })

  test("is recorded again from its readings set right since: the book's entry and its log replaced, never doubled", async () => {
    const { storage, drafts, session } = await setUp()
    await startPlay(drafts, DRAFT)
    await finishPlay(session, drafts, DRAFT, BOOK, RECORD, FINISH, NOW)
    const [kept] = ((found) => (found.ok ? found.value : []))(await loadTodaysPlays(drafts, "2026-10-04" as IsoDate))
    const added = await addCheckpoints(drafts, kept as PlayDraft, [{ spins: 20, outlay: 500 }])
    expect((await finishPlay(session, drafts, added.ok ? added.value : DRAFT, BOOK, { ...RECORD, payout: dec("6000") }, FINISH, NOW)).ok).toBe(true)
    const transactions = transactionsOf(storage.peek(BOOK)?.files)
    expect(transactions.match(/play-id: live-1,/g)?.length).toBe(1)
    expect(transactions).toContain('6000 "玉(4円・マレハン東京皇国第8支店)"')
    expect(storage.peek(BOOK)?.files[`pachinko-play/${ID}.jsonl`]).toContain('{"spins":20,"outlay":500}')
  })

  test("leaves the day's plays once it is recorded and the business day has turned, and stays, still to be recorded, where it is not", async () => {
    const { drafts, session } = await setUp()
    await startPlay(drafts, DRAFT)
    await startPlay(drafts, { ...DRAFT, id: "live-2" as PlayId })
    await finishPlay(session, drafts, DRAFT, BOOK, RECORD, FINISH, NOW)
    const next = await loadTodaysPlays(drafts, "2026-10-05" as IsoDate)
    expect(mapOk(next, (found) => found.map((draft) => [draft.id, isLeftOver(draft, "2026-10-05" as IsoDate)]))).toEqual({ ok: true, value: [["live-2", true]] } as never)
    expect(mapOk(await loadDrafts(drafts), (found) => found.length)).toEqual({ ok: true, value: 1 })
  })

  test("has everything done to its log written into its history, whoever keeps it, a line changed again at once being the one change", async () => {
    const { drafts: plain } = await setUp()
    const clock = { now: "2026-10-04T13:00:00.000Z" }
    const drafts = keepingHistory(plain, () => clock.now)
    await startPlay(drafts, DRAFT)
    const first = await addCheckpoints(drafts, DRAFT, [{ spins: 250, outlay: 1000 }])
    clock.now = "2026-10-04T13:00:30.000Z"
    const second = await reviseCheckpoints(drafts, first.ok ? first.value : DRAFT, [{ spins: 0, outlay: 0, counter: { spins: 120 } }, { spins: 250, outlay: 2000 }])
    clock.now = "2026-10-04T15:00:00.000Z"
    await reviseCheckpoints(drafts, second.ok ? second.value : DRAFT, [{ spins: 0, outlay: 0, counter: { spins: 120 } }])
    const [kept] = ((found) => (found.ok ? found.value : []))(await loadDrafts(drafts))
    expect(kept?.history).toEqual([
      { at: "2026-10-04T13:00:30.000Z", removed: [], added: ['{"spins":250,"outlay":2000}'] },
      { at: "2026-10-04T15:00:00.000Z", removed: ['{"spins":250,"outlay":2000}'], added: [] },
    ])
  })

  test("keeps the draft when the book refuses the record", async () => {
    const { drafts, session } = await setUp()
    await startPlay(drafts, DRAFT)
    const nowhere = { ...MALEHAN, name: "未登録店" }
    const refused = await finishPlay(session, drafts, DRAFT, BOOK, { ...RECORD, parlor: nowhere, rental: undefined, replay: { paidOut: dec("10"), deducted: dec("10") }, payout: dec("0") }, { at: undefined, counter: undefined }, NOW)
    expect(refused.ok === false && refused.error.type).toBe("journal-rejected")
    expect(mapOk(await loadDrafts(drafts), (found) => found.map((draft) => draft.id))).toEqual({ ok: true, value: [ID] })
  })
})

describe("a play with no parlor", () => {
  test("is recorded by its two sides in yen, its log beside it, and stays among the day's plays", async () => {
    const { storage, drafts, session } = await setUp()
    const nowhere: PlayDraft = { ...DRAFT, venue: { type: "none", terms: undefined } }
    await startPlay(drafts, nowhere)
    const play = {
      id: ID,
      date: "2026-10-04" as IsoDate,
      parlor: undefined,
      gameKind: "pachinko" as const,
      machine: "流星",
      cabinetNumber: "123",
      outlay: dec("5000"),
      takings: dec("0"),
      settlement: undefined,
      theoreticalValue: undefined,
      told: undefined,
    }
    expect((await finishPlayInYen(session, drafts, nowhere, BOOK, play, { at: undefined, counter: undefined }, NOW, undefined)).ok).toBe(true)
    const [head = "", ...readings] = (storage.peek(BOOK)?.files[`pachinko-play/${ID}.jsonl`] ?? "").split("\n")
    expect([JSON.parse(head).header, JSON.parse(head).parlor, JSON.parse(head).terms]).toEqual([true, undefined, undefined])
    expect(readings.join("\n")).toBe(`${nowhere.log}{"spins":0,"event":{"kind":"finished"}}\n`)
    expect(mapOk(await loadDrafts(drafts), (found) => found.map((draft) => draft.recorded !== undefined))).toEqual({ ok: true, value: [true] })
  })
})

const MEGA_CONDOR_1 = { identity: { type: "listed" as const, id: "mega-condor" as ParlorId }, parlorName: "メガコンドル見滝原店", pool: { kind: "ball" as const, tier: "1円" }, rate: dec("0.892857"), date: "2026-10-04" as IsoDate }

describe("a pool the book does not keep", () => {
  test("is opened with the day's rate, and then played like any other", async () => {
    const { storage, session } = await setUp()
    const opened = await openPool(session, BOOK, MEGA_CONDOR_1)
    expect(opened).toEqual({ ok: true, value: { identity: { type: "listed", id: "mega-condor" }, name: "メガコンドル見滝原店", pools: [{ kind: "ball", tier: "1円" }] } } as never)
    const context = await loadRecordingContext(session, BOOK, ME)
    expect(mapOk(context, (found) => found.parlors.map((parlor) => parlor.name))).toEqual({ ok: true, value: ["マレハン東京皇国第8支店", "723豚の帽子亭店", "メガコンドル見滝原店"] })
    const megaCondor = opened.ok ? opened.value : MALEHAN
    const rented = { ...RECORD, parlor: megaCondor, pool: { kind: "ball" as const, tier: "1円" }, rental: { outlay: dec("1000"), tokens: dec("890") } }
    expect((await recordTokenTally(session, BOOK, rented)).ok).toBe(true)
    expect(transactionsOf(storage.peek(BOOK)?.files)).toMatch(/費用:遊技 +890 "玉\(1円・メガコンドル見滝原店\)" @ 0.892857 JPY/)
  })

  test("opened again on the same day at the same rate writes nothing more", async () => {
    const { storage, session } = await setUp()
    await openPool(session, BOOK, MEGA_CONDOR_1)
    const before = storage.peek(BOOK)?.files
    expect((await openPool(session, BOOK, MEGA_CONDOR_1)).ok).toBe(true)
    expect(storage.peek(BOOK)?.files).toEqual(before as never)
  })

  test("is refused under a name another parlor of the book has, and nothing is written", async () => {
    const { storage, session } = await setUp()
    const before = storage.peek(BOOK)?.files
    const refused = await openPool(session, BOOK, { ...MEGA_CONDOR_1, parlorName: "マレハン東京皇国第8支店" })
    expect(refused).toEqual({ ok: false, error: { type: "parlor", error: { type: "name-taken", name: "マレハン東京皇国第8支店" } } })
    expect(storage.peek(BOOK)?.files).toEqual(before as never)
  })
})

describe("a parlor submitted and waiting on the list", () => {
  const SUBMITTED = { ...MEGA_CONDOR_1, identity: { type: "submitted" as const, submission: "sub_01" as SubmissionId }, parlorName: "新しい店" }
  const LISTED = {
    id: "osm-9" as never,
    name: "新しい店",
    reading: "あたらしいみせ",
    keywords: [],
    prefecture: "大阪府" as const,
    address: "見滝原市1-2-3",
    location: { latitude: 34.66, longitude: 135.5 },
    submissions: ["sub_01" as SubmissionId],
  }

  test("is played at like any parlor, and linked once the list has taken it", async () => {
    const { storage, session } = await setUp()
    const opened = await openPool(session, BOOK, SUBMITTED)
    const waiting = opened.ok ? opened.value : MALEHAN
    const played = { ...RECORD, parlor: waiting, pool: { kind: "ball" as const, tier: "1円" }, rental: { outlay: dec("1000"), tokens: dec("890") } }
    expect((await recordTokenTally(session, BOOK, played)).ok).toBe(true)
    expect(await linkSubmissions(session, BOOK, [])).toEqual({ ok: true, value: 0 })
    expect(await linkSubmissions(session, BOOK, [LISTED])).toEqual({ ok: true, value: 1 })
    const files = storage.peek(BOOK)?.files ?? {}
    expect(files["accounts.journal"]).toContain("parlor-submission: sub_01, parlor-id: osm-9")
    expect(transactionsOf(files)).toContain("parlor-submission: sub_01, parlor-id: osm-9")
    const context = await loadRecordingContext(session, BOOK, ME)
    expect(mapOk(context, (found) => found.parlors.find((parlor) => parlor.name === "新しい店")?.identity)).toEqual({ ok: true, value: { type: "listed", id: "osm-9" } } as never)
    expect(await linkSubmissions(session, BOOK, [LISTED])).toEqual({ ok: true, value: 0 })
  })

  test("is worth, as it is about to be recorded, what its log finished as the form says comes to", async () => {
    const figures = { roundChanceOneIn: 100 / 30, payoutPerRound: 140, totalChanceOneIn: 100 / 3, spinsPerHour: 200 }
    const played: PlayDraft = {
      ...DRAFT,
      pachinko: { id: "f" as never, name: "流星", figures } as never,
      log: `${DRAFT.log}{"spins":40,"outlay":1000,"counter":{"spins":160},"phase":"regular"}\n{"spins":80,"outlay":2000,"counter":{"spins":200},"phase":"regular"}\n`,
    }
    const engine = {} as never
    const at = (counter: number | undefined, held: number | undefined) => theoreticalValueAtFinish(engine, played, { at: undefined, counter }, held)
    const asLogged = await at(undefined, undefined)
    const further = await at(260, undefined)
    const counted = await at(260, 100)
    expect(asLogged).toBeDefined()
    expect(further).toBeGreaterThan(asLogged ?? Number.POSITIVE_INFINITY)
    expect(counted).not.toBe(further)
    expect(await at(260, 100)).toBe(counted)
  })
})
