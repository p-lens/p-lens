import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test"

import type { PlayDraft } from "../../src/core/live-play/draft"
import type { PlayId } from "../../src/core/play/play"
import type { HledgerClient } from "../../src/hledger/client/client"
import { inProcessHledger } from "../support/in-process"
import { closeLines, letEverythingGo, relayOf, TODAY, twoDevices, until, type Device } from "./support/devices"

const MARKER = "MARKER-ゼーレ会議室-1015"

const held = { hledgers: [] as HledgerClient[] }

beforeAll(async () => {
  held.hledgers = [await inProcessHledger(), await inProcessHledger()]
})

afterEach(letEverythingGo)

afterAll(() => {
  held.hledgers = []
})

const playOf = (id: string, lines: number, machine = "ミスターパチンコ"): PlayDraft => ({
  id: id as PlayId,
  date: TODAY,
  venue: { type: "none", terms: undefined },
  gameKind: "pachinko",
  pachinko: undefined,
  machine,
  cabinetNumber: undefined,
  startedAt: `${TODAY}T01:00:00.000Z`,
  log: Array.from({ length: lines }, (_, index) => JSON.stringify({ spins: index * 10, outlay: index * 500, at: `${TODAY}T01:${String(index % 60).padStart(2, "0")}:00.000Z` })).join("\n"),
})

const followedLog = (device: Device, id: string): string | undefined => device.heard.followed.find((play) => play.playId === id)?.play.log

const draftOf = async (device: Device, id: string): Promise<PlayDraft | undefined> => ((found) => (found.ok ? found.value : undefined))(await device.drafts.readDraft(id as PlayId))

const append = async (device: Device, id: string, line: string): Promise<void> => {
  const draft = await draftOf(device, id)
  if (draft === undefined) throw new Error("no draft")
  const updated = await device.drafts.updateDraft({ ...draft, log: `${draft.log}\n${line}` }, draft.log)
  if (!updated.ok) throw new Error(JSON.stringify(updated.error))
}

describe("plays between the owner's devices", () => {
  test("a play started on one device is followed on the other, and what is added to it reaches it", async () => {
    const { one, other, lineOne } = await twoDevices(held.hledgers)
    await one.drafts.createDraft(playOf("play-1", 3))
    lineOne.plays.wrote()
    await until(() => followedLog(other, "play-1") === playOf("play-1", 3).log)
    await append(one, "play-1", '{"spins":99}')
    lineOne.plays.wrote()
    await until(() => followedLog(other, "play-1")?.endsWith('{"spins":99}') === true)
    expect(await draftOf(other, "play-1")).toBeUndefined()
  }, 30_000)

  test("a play taken over moves to the other device, and the first follows it", async () => {
    const { one, other, lineOne, lineOther } = await twoDevices(held.hledgers)
    await one.drafts.createDraft(playOf("play-2", 3))
    lineOne.plays.wrote()
    await until(() => followedLog(other, "play-2") !== undefined)
    expect(await lineOther.plays.takeOver("play-2" as PlayId)).toEqual({ ok: true, value: undefined })
    expect((await draftOf(other, "play-2"))?.log).toBe(playOf("play-2", 3).log)
    await until(() => one.heard.yielded.length > 0)
    expect(one.heard.yielded).toEqual([{ playId: "play-2" as PlayId, lost: 0 }])
    expect(await draftOf(one, "play-2")).toBeUndefined()
    expect(followedLog(one, "play-2")).toBe(playOf("play-2", 3).log)
    await append(other, "play-2", '{"spins":77}')
    lineOther.plays.wrote()
    await until(() => followedLog(one, "play-2")?.endsWith('{"spins":77}') === true)
  }, 30_000)

  test("what a device wrote out of reach after the play was taken over is counted lost as it yields", async () => {
    const { one, other, lineOne } = await twoDevices(held.hledgers)
    await one.drafts.createDraft(playOf("play-3", 3))
    lineOne.plays.wrote()
    await until(() => followedLog(other, "play-3") !== undefined)
    await closeLines()
    await append(one, "play-3", '{"spins":500}')
    await append(one, "play-3", '{"spins":510}')
    const lineOther = await other.open()
    await until(async () => (await lineOther.plays.takeOver("play-3" as PlayId)).ok, 10_000)
    await one.open()
    await until(() => one.heard.yielded.length > 0, 10_000)
    expect(one.heard.yielded).toEqual([{ playId: "play-3" as PlayId, lost: 2 }])
    expect(await draftOf(one, "play-3")).toBeUndefined()
  }, 40_000)

  test("a long log goes in pieces and comes together whole, and a line added to it rewrites its head alone", async () => {
    const { one, other, lineOne } = await twoDevices(held.hledgers)
    const long = playOf("play-4", 2_500)
    await one.drafts.createDraft(long)
    lineOne.plays.wrote()
    await until(() => followedLog(other, "play-4") === long.log, 15_000)
    const copies = relayOf()?.events().filter((event) => event.kind === 34739) ?? []
    expect(copies.length).toBeGreaterThan(2)
    const before = copies.length
    await append(one, "play-4", '{"spins":99999}')
    lineOne.plays.wrote()
    await until(() => followedLog(other, "play-4")?.endsWith('{"spins":99999}') === true, 15_000)
    const after = relayOf()?.events().filter((event) => event.kind === 34739) ?? []
    const dOf = (event: (typeof after)[number]): string | undefined => event.tags.find((tag) => tag[0] === "d")?.[1]
    expect(after.length).toBe(before + 1)
    expect(copies.map(dOf)).toContain(dOf(after.at(-1) as (typeof after)[number]))
  }, 40_000)

  test("a play given up leaves the line, and the other device lets it go", async () => {
    const { one, other, lineOne } = await twoDevices(held.hledgers)
    await one.drafts.createDraft(playOf("play-5", 2))
    lineOne.plays.wrote()
    await until(() => followedLog(other, "play-5") !== undefined)
    await one.drafts.deleteDraft("play-5" as PlayId)
    lineOne.plays.wrote()
    await until(() => followedLog(other, "play-5") === undefined)
  }, 30_000)

  test("taking over is refused while the relay is out of reach, and the play is still followed", async () => {
    const { one, other, lineOne, lineOther } = await twoDevices(held.hledgers)
    await one.drafts.createDraft(playOf("play-6", 2))
    lineOne.plays.wrote()
    await until(() => followedLog(other, "play-6") !== undefined)
    relayOf()?.stop()
    await until(async () => !(await lineOther.plays.takeOver("play-6" as PlayId)).ok)
    expect(await draftOf(other, "play-6")).toBeUndefined()
    expect(followedLog(other, "play-6")).toBeDefined()
  }, 30_000)

  test("the relay holds nothing of a play that can be read", async () => {
    const { one, other, lineOne } = await twoDevices(held.hledgers)
    await one.drafts.createDraft(playOf("play-7", 4, MARKER))
    lineOne.plays.wrote()
    await until(() => followedLog(other, "play-7") !== undefined)
    const copies = relayOf()?.events().filter((event) => event.kind === 34739) ?? []
    const everything = JSON.stringify(copies)
    expect(everything).not.toContain(MARKER)
    expect(everything).not.toContain("ゼーレ")
    expect(everything).not.toContain("play-7")
    expect(everything).not.toContain(TODAY)
    expect(copies.every((event) => event.tags.map((tag) => tag[0]).toSorted().join() === "d,expiration,v")).toBe(true)
    expect(copies.every((event) => Number(event.tags.find((tag) => tag[0] === "expiration")?.[1]) % 86_400 === 0)).toBe(true)
  }, 30_000)
})
