import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test"

import { appendEntry, BOOK_FILES } from "../../src/core/journal/layout"
import { Ok } from "../../src/core/result/result"
import type { HledgerClient } from "../../src/hledger/client/client"
import { joinByCode } from "../../src/crossing/application/joining"
import { bookLineKeysOf, eventsOfChange, isOwnersLink, ownersKeysOf, startSync, syncCodeOf } from "../../src/crossing/application/book-sync"
import { mailboxEvent } from "../../src/crossing/application/book-sharing"
import { changeIdOf, stateDigestOf, type Change, type ChangeId } from "../../src/crossing/core/book/change"
import { ROSTER_FILE } from "../../src/crossing/core/book/roster"
import { patchesBetween } from "../../src/crossing/core/book/state"
import { NAMES } from "../../src/crossing/core/keyring"
import { createWebCryptoKeys } from "../../src/crossing/browser/web-crypto-keys"
import { createWebSocketRelays } from "../../src/crossing/browser/websocket-relays"
import { fixtureBook, inProcessHledger } from "../support/in-process"
import { BOOK, deviceOn, letEverythingGo, ME, startRelay, until, type Device } from "./support/devices"

const MARKER = "MARKER-ネルフ本部-0451"

const held = { hledgers: [] as HledgerClient[] }

beforeAll(async () => {
  held.hledgers = await Promise.all([inProcessHledger(), inProcessHledger(), inProcessHledger(), inProcessHledger()])
})

afterEach(letEverythingGo)

afterAll(() => {
  held.hledgers = []
})

const entryOf = (day: string, yen: number, note: string): string => `${day} ${note}\n    費用:遊技  ${yen} JPY\n    資産:現金`

const has = async (device: Device, note: string): Promise<boolean> => (await device.files())[BOOK_FILES.transactions]?.includes(note) === true

const hledgerAt = (index: number): HledgerClient => held.hledgers[index] as HledgerClient

/** The owner's device with the fixture book on a line, open; and a device for each other person, not yet in. */
const shared = async () => {
  const relay = startRelay()
  const owner = deviceOn(relay.url, hledgerAt(0))
  const created = await owner.session.createBook(await fixtureBook("basic-play", { id: BOOK, members: [ME] }))
  if (!created.ok) throw new Error(JSON.stringify(created.error))
  const started = await startSync(owner.ports, BOOK)
  if (!started.ok || !isOwnersLink(started.value)) throw new Error(JSON.stringify(started))
  const ownerLine = await owner.open()
  await until(() => owner.last()?.type === "synced")
  const others = [deviceOn(relay.url, hledgerAt(1)), deviceOn(relay.url, hledgerAt(2)), deviceOn(relay.url, hledgerAt(3))] as const
  return { relay, owner, ownerLine, others, syncCode: syncCodeOf(started.value) }
}

/** A person let in on a device: their code made on the owner's line, the book joined by it, and its line opened. */
const letIn = async (ownerLine: Awaited<ReturnType<typeof shared>>["ownerLine"], device: Device, name: string, role: "editor" | "viewer") => {
  const member = await ownerLine.book.invite(name, role)
  if (!member.ok) throw new Error(JSON.stringify(member.error))
  const joined = await joinByCode(device.ports, member.value.code)
  if (!joined.ok) throw new Error(JSON.stringify(joined.error))
  const line = await device.openBook()
  await until(() => device.last()?.type === "synced")
  return { member: member.value, line }
}

describe("a book shared with people the owner lets in", () => {
  test("an editor joins by their code, as an editor, and what either writes reaches the other", async () => {
    const { owner, ownerLine, others } = await shared()
    const [editor] = others
    const { line } = await letIn(ownerLine, editor, "次元", "editor")
    const books = await editor.session.books()
    expect(books.ok && books.value.map((book) => book.members.map((member) => member.role))).toEqual([["editor"]])
    await editor.write(entryOf("2026-11-01", 1000, "編集者から"))
    line.book.wrote()
    await until(() => has(owner, "編集者から"))
    await owner.write(entryOf("2026-11-02", 2000, "持ち主から"))
    ownerLine.book.wrote()
    await until(() => has(editor, "持ち主から"))
    await until(async () => JSON.stringify(await owner.files()) === JSON.stringify(await editor.files()))
    expect(Object.keys(await editor.files())).not.toContain(ROSTER_FILE)
  }, 30_000)

  test("a viewer reads the book, writes nothing to it, and has what its book became alone put back", async () => {
    const { relay, owner, ownerLine, others } = await shared()
    const [viewer] = others
    const { line } = await letIn(ownerLine, viewer, "五ェ門", "viewer")
    await owner.write(entryOf("2026-11-03", 3000, "見せる分"))
    ownerLine.book.wrote()
    await until(() => has(viewer, "見せる分"))
    const refused = await viewer.session.write(BOOK, async (_, stored) => Ok({ files: stored.files, intent: { type: "file-edited", path: BOOK_FILES.transactions } }))
    expect(refused.ok).toBe(false)
    const stored = await viewer.storage.readBook(BOOK)
    if (!stored.ok) throw new Error("unread")
    const before = stored.value.files[BOOK_FILES.transactions] ?? ""
    await viewer.storage.applyChanges(BOOK, [{ path: BOOK_FILES.transactions, before, after: appendEntry(before, entryOf("2026-11-04", 4000, "勝手な分")) }])
    line.book.wrote()
    await until(async () => !(await has(viewer, "勝手な分")))
    const authors = new Set(relay.events().map((event) => event.pubkey))
    const ownerKey = (await bookLineKeysOf(createWebCryptoKeys(), await owner.linkOf())).owner
    expect([...authors]).toEqual([ownerKey])
  }, 30_000)

  test("a change an editor makes of the roster, or a merge no device would make, is never taken", async () => {
    const { owner, ownerLine, others } = await shared()
    const [editor] = others
    const { member } = await letIn(ownerLine, editor, "不二子", "editor")
    const keys = createWebCryptoKeys()
    const link = await editor.linkOf()
    const line = await bookLineKeysOf(keys, link)
    const signer = await keys.signingKey(member.invitation, NAMES.member)
    const shadow = await editor.lines.shadow(BOOK)
    if (!shadow.ok) throw new Error("no shadow")
    const forged = (files: typeof shadow.value, change: Omit<Change, "patches" | "result"> & { readonly sort: "edit" | "merge" }): Change => {
      const patches = patchesBetween(shadow.value, files)
      if (!patches.ok) throw new Error("no patches")
      return { ...change, patches: patches.value, result: stateDigestOf(files) } as Change
    }
    const at = Math.floor(Date.now() / 1000)
    const roster = forged({ ...shadow.value, [ROSTER_FILE]: `${shadow.value[ROSTER_FILE] ?? "{}"}`.replace('"viewer"', '"editor"') + " " }, { sort: "edit", parents: [link.head], writer: signer.pubkey, at })
    const title = forged({ ...shadow.value, [BOOK_FILES.main]: `; book-title-p: 乗っ取り\n${shadow.value[BOOK_FILES.main] ?? ""}` }, { sort: "edit", parents: [link.head], writer: signer.pubkey, at })
    const sibling = forged({ ...shadow.value, [BOOK_FILES.transactions]: appendEntry(shadow.value[BOOK_FILES.transactions] ?? "", entryOf("2026-11-05", 500, "正当な分")) }, { sort: "edit", parents: [link.head], writer: signer.pubkey, at })
    const sneaked = forged(
      { ...shadow.value, [BOOK_FILES.transactions]: appendEntry(shadow.value[BOOK_FILES.transactions] ?? "", entryOf("2026-11-06", 9999, "紛れ込ませた分")) },
      { sort: "merge", parents: [link.head, changeIdOf(sibling)].toSorted() as [ChangeId, ChangeId], writer: "", at },
    )
    const connection = createWebSocketRelays().connect(link.relay)
    await until(() => connection.state().type === "open")
    for (const change of [roster, title, sibling, sneaked]) {
      const events = await eventsOfChange(keys, line, signer, change, at)
      if (!events.ok) throw new Error("unsealed")
      for (const event of events.value) await connection.publish(event, 5_000)
    }
    connection.close()
    ownerLine.book.wrote()
    await until(() => has(owner, "正当な分"))
    await new Promise((resolve) => setTimeout(resolve, 2_500))
    expect(await has(owner, "紛れ込ませた分")).toBe(false)
    expect((await owner.files())[BOOK_FILES.main]).not.toContain("乗っ取り")
    expect((await ownerLine.book.members()).map((each) => each.role)).toEqual(["editor"])
  }, 30_000)

  test("taking a person out moves the book to a new epoch: they are told and get nothing more, and everyone else goes on", async () => {
    const { owner, ownerLine, others, syncCode } = await shared()
    const [editor, viewer, ownersOther] = others
    const { line: editorLine } = await letIn(ownerLine, editor, "次元", "editor")
    const { member: gone } = await letIn(ownerLine, viewer, "銭形", "viewer")
    const joined = await joinByCode(ownersOther.ports, syncCode)
    if (!joined.ok) throw new Error(JSON.stringify(joined.error))
    await ownersOther.open()
    await until(() => ownersOther.last()?.type === "synced")
    const removed = await ownerLine.book.remove(gone.mailbox)
    expect(removed).toEqual(Ok(undefined))
    await until(() => viewer.heard.removed === 1)
    await until(async () => (await editor.linkOf()).epochNumber === 1 && (await editor.linkOf()).floor.type === "at", 15_000)
    await until(async () => (await ownersOther.linkOf()).epochNumber === 1 && (await ownersOther.linkOf()).floor.type === "at", 15_000)
    await editor.write(entryOf("2026-11-07", 700, "外したあと"))
    editorLine.book.wrote()
    await until(() => has(owner, "外したあと"), 15_000)
    await until(() => has(ownersOther, "外したあと"), 15_000)
    expect(await has(viewer, "外したあと")).toBe(false)
    expect((await ownerLine.book.members()).map((each) => each.name)).toEqual(["次元"])
    expect(await joinByCode(viewer.ports, gone.code)).toEqual({ ok: false, error: { type: "removed" } })
  }, 60_000)

  test("a person taken out is told so on a relay that takes only the mailboxes an access list holds, and the same name invited again joins", async () => {
    const { relay, owner, ownerLine, others } = await shared()
    relay.refuseUnlistedMailboxes(true)
    const [viewer, again] = others
    const { member: gone } = await letIn(ownerLine, viewer, "銭形", "viewer")
    expect(await ownerLine.book.remove(gone.mailbox)).toEqual(Ok(undefined))
    await until(() => viewer.heard.removed === 1)
    const invited = await ownerLine.book.invite("銭形", "viewer")
    if (!invited.ok) throw new Error(JSON.stringify(invited.error))
    await until(() => owner.last()?.type === "synced")
    expect(await joinByCode(again.ports, invited.value.code)).toEqual({ ok: true, value: { type: "book", bookId: BOOK } })
  }, 30_000)

  test("a mailbox the relay will never take is let go of, and stops nothing sent after it", async () => {
    const relay = startRelay()
    relay.refuseUnlistedMailboxes(true)
    const owner = deviceOn(relay.url, hledgerAt(0))
    const created = await owner.session.createBook(await fixtureBook("basic-play", { id: BOOK, members: [ME] }))
    if (!created.ok) throw new Error(JSON.stringify(created.error))
    const started = await startSync(owner.ports, BOOK)
    if (!started.ok || !isOwnersLink(started.value)) throw new Error(JSON.stringify(started))
    const keys = createWebCryptoKeys()
    const owners = await ownersKeysOf(keys, started.value.access.sync)
    const unlisted = await mailboxEvent(keys, owners.owner, keys.newSecret(), { type: "removed", role: "viewer", stamp: 1 }, Math.floor(Date.now() / 1000))
    if (unlisted === undefined) throw new Error("no mailbox")
    expect((await owner.lines.queue(BOOK, [unlisted])).ok).toBe(true)
    const ownerLine = await owner.open()
    const invited = await ownerLine.book.invite("次元", "editor")
    if (!invited.ok) throw new Error(JSON.stringify(invited.error))
    await until(() => owner.last()?.type === "synced")
    expect(relay.events().some((event) => event.id === unlisted.id)).toBe(false)
    const [editor] = [deviceOn(relay.url, hledgerAt(1))]
    expect(await joinByCode(editor.ports, invited.value.code)).toEqual({ ok: true, value: { type: "book", bookId: BOOK } })
  }, 30_000)

  test("what the owner calls the people let in, and the book, never reach the relay readable", async () => {
    const { relay, ownerLine, others } = await shared()
    const [editor] = others
    await letIn(ownerLine, editor, MARKER, "editor")
    expect((await ownerLine.book.members()).map((each) => each.name)).toEqual([MARKER])
    const everything = JSON.stringify(relay.events())
    expect(everything).not.toContain(MARKER)
    expect(everything).not.toContain(BOOK)
    expect(relay.events().every((event) => event.tags.every((tag) => ["v", "d", "expiration"].includes(tag[0] ?? "")))).toBe(true)
  }, 30_000)

  test("an editor's other device joins by the same code and writes as the same editor", async () => {
    const { owner, ownerLine, others } = await shared()
    const [editor, editorsOther] = others
    const { member } = await letIn(ownerLine, editor, "次元", "editor")
    const joined = await joinByCode(editorsOther.ports, member.code)
    if (!joined.ok) throw new Error(JSON.stringify(joined.error))
    const line = await editorsOther.openBook()
    await until(() => editorsOther.last()?.type === "synced")
    await editorsOther.write(entryOf("2026-11-08", 800, "二台目の編集者"))
    line.book.wrote()
    await until(() => has(owner, "二台目の編集者"))
    await until(() => has(editor, "二台目の編集者"))
  }, 30_000)
})
