import { describe, expect, test } from "bun:test"

import { BOOK_FILES, type BookFiles } from "../../src/core/journal/layout"
import { changeIdOf, stateDigestOf, type Change, type ChangeId } from "../../src/crossing/core/book/change"
import { mergeStates } from "../../src/crossing/core/book/merge"
import { codeIn } from "../../src/crossing/core/book/pasted-code"
import { bookPartOf, rosterOf, rosterText, ROSTER_FILE, stateOfBook, type Roster } from "../../src/crossing/core/book/roster"
import { invitationCodeText, mailboxJson, readInvitationCode, readMailbox, readVaulted, accessText, vaultedJson } from "../../src/crossing/core/book/sharing"
import { patchesBetween } from "../../src/crossing/core/book/state"
import { onFloorOf, takenOf } from "../../src/crossing/core/book/taking"
import { invitationMessage } from "../../src/ui/wording/sharing"

const OWNER = "a".repeat(64)
const EDITOR = "b".repeat(64)
const STRANGER = "c".repeat(64)
const MAILBOX = "0".repeat(32)
const OTHER_MAILBOX = "1".repeat(32)

const EDITORS = { mailbox: MAILBOX, role: "editor", pubkey: EDITOR, vault: "sealed" } as const
const VIEWERS = { mailbox: OTHER_MAILBOX, role: "viewer", pubkey: undefined, vault: "sealed-2" } as const
const SENDER_MAILBOX = "2".repeat(32)
const SENDERS = { mailbox: SENDER_MAILBOX, role: "sender", pubkey: STRANGER, vault: "sealed-3" } as const

const ROSTER: Roster = { epoch: undefined, members: [EDITORS] }

const BOOK: BookFiles = { [BOOK_FILES.main]: "; book-title-p: 帳簿\ninclude transactions.journal\n", [BOOK_FILES.transactions]: "", "settings.json": '{\n  "order": 1\n}\n' }

const base = (files: BookFiles): Change => ({ sort: "base", parents: [], writer: OWNER, at: 1, book: "book-1", files, result: stateDigestOf(files) })

const editOn = (parent: ChangeId, before: BookFiles, after: BookFiles, writer: string, at = 2): Change => {
  const patches = patchesBetween(before, after)
  if (!patches.ok) throw new Error("no patches")
  return { sort: "edit", parents: [parent], writer, at, patches: patches.value, result: stateDigestOf(after) }
}

/** A line begun by the owner with the editor in its roster, and the changes given made on it. */
const lineOf = (...changes: readonly Change[]): Map<ChangeId, Change> => new Map(changes.map((change) => [changeIdOf(change), change]))

const shared: BookFiles = { ...BOOK, [ROSTER_FILE]: rosterText(ROSTER) }
const first = base(shared)
const firstId = changeIdOf(first)

describe("a roster", () => {
  test("reads back as it was written, merges key by key, and reads nothing else", () => {
    const roster: Roster = { epoch: { n: 2, secret: "sealed-epoch" }, members: [EDITORS, VIEWERS, SENDERS] }
    expect(rosterOf(rosterText(roster))).toEqual(roster)
    expect(rosterOf(undefined)).toEqual({ epoch: undefined, members: [] })
    expect(rosterOf('{ "member:x": { "role": "viewer", "vault": "v" } }')).toBe("unreadable")
    expect(rosterOf(`{ "member:${MAILBOX}": { "role": "viewer", "vault": "v", "name": "次元" } }`)).toBe("unreadable")
    expect(rosterOf(`{ "note": "次元" }`)).toBe("unreadable")
    const merged = mergeStates({}, { [ROSTER_FILE]: rosterText({ epoch: undefined, members: [EDITORS] }) }, { [ROSTER_FILE]: rosterText({ epoch: undefined, members: [VIEWERS] }) })
    expect(merged.ok && rosterOf(merged.value[ROSTER_FILE])).toEqual({ epoch: undefined, members: [EDITORS, VIEWERS] })
  })

  test("stays with the line: the book a person reads has none, and the book written keeps the line's", () => {
    expect(bookPartOf(shared)).toEqual(BOOK)
    expect(stateOfBook(BOOK, shared)).toEqual(shared)
  })
})

describe("codes and what is sealed for the people let in", () => {
  test("an invitation code reads back, and nothing else reads as one", () => {
    const code = { invitation: new Uint8Array(32).fill(7), owner: OWNER, relay: "wss://relay.example/0a" }
    expect(readInvitationCode(invitationCodeText(code))).toEqual(code)
    expect(readInvitationCode(invitationCodeText(code).replace(OWNER, "x"))).toBeUndefined()
    expect(readInvitationCode("p-lens-sync:1:x")).toBeUndefined()
  })

  test("a code is read out of the whole message it was sent in, with its line breaks or without", () => {
    const code = invitationCodeText({ invitation: new Uint8Array(32).fill(7), owner: OWNER, relay: "wss://relay.example/0a" })
    const message = invitationMessage("P-Lens", "マイ帳簿", "editor", code)
    expect(codeIn(message)).toBe(code)
    expect(codeIn(message.replaceAll("\n", ""))).toBe(code)
    expect(codeIn(` ${code} `)).toBe(code)
    expect(codeIn("p-lens-sync:1:abc:def:ws://127.0.0.1:7790\n次の行")).toBe("p-lens-sync:1:abc:def:ws://127.0.0.1:7790")
    expect(codeIn("コードなし")).toBe("コードなし")
  })

  test("a mailbox and the vault read back, held to their fields", () => {
    const said = { type: "member", role: "editor", epoch: 1, secret: new Uint8Array(32).fill(3), stamp: 10 } as const
    expect(readMailbox(JSON.parse(JSON.stringify(mailboxJson(said))))).toEqual(said)
    expect(readMailbox(mailboxJson({ type: "removed", role: "viewer", stamp: 11 }))).toEqual({ type: "removed", role: "viewer", stamp: 11 })
    expect(readMailbox({ ...(mailboxJson(said) as object), title: "x" })).toBeUndefined()
    const sender = { type: "sender", title: "マイ帳簿", inbox: "3".repeat(32), stamp: 12 } as const
    expect(readMailbox(JSON.parse(JSON.stringify(mailboxJson(sender))))).toEqual(sender)
    expect(readMailbox({ ...(mailboxJson(sender) as object), secret: "x" })).toBeUndefined()
    expect(readMailbox(mailboxJson({ type: "removed", role: "sender", stamp: 13 }))).toEqual({ type: "removed", role: "sender", stamp: 13 })
    expect(readVaulted(vaultedJson({ name: "次元", invitation: new Uint8Array(32) }))).toEqual({ name: "次元", invitation: new Uint8Array(32) })
  })

  test("the access list says roles, keys and mailboxes, and no name", () => {
    const withSender: Roster = { ...ROSTER, members: [EDITORS, SENDERS] }
    expect(JSON.parse(accessText("sharing", withSender, 5))).toEqual({ product: "sharing", members: [{ role: "editor", pubkey: EDITOR, mailbox: MAILBOX }], stamp: 5 })
    expect(JSON.parse(accessText("sending", withSender, 6))).toEqual({ product: "sending", members: [{ role: "sender", pubkey: STRANGER, mailbox: SENDER_MAILBOX }], stamp: 6 })
  })
})

describe("which changes are taken", () => {
  const added = (files: BookFiles, line: string): BookFiles => ({ ...files, [BOOK_FILES.transactions]: `${files[BOOK_FILES.transactions] ?? ""}${line}\n` })

  test("the owner's, and an editor's the roster lists, and anything made on them", () => {
    const editors = editOn(firstId, shared, added(shared, "; 編集者"), EDITOR)
    const owners = editOn(changeIdOf(editors), added(shared, "; 編集者"), added(added(shared, "; 編集者"), "; 持ち主"), OWNER, 3)
    const held = lineOf(first, editors, owners)
    expect(takenOf(held, OWNER, new Set(), undefined)).toEqual(new Set([firstId, changeIdOf(editors), changeIdOf(owners)]))
  })

  test("not a stranger's, nor an editor's that changes the roster, the title or the book's place, nor anything made on one", () => {
    const strangers = editOn(firstId, shared, added(shared, "; 他人"), STRANGER)
    const roster = editOn(firstId, shared, { ...shared, [ROSTER_FILE]: rosterText({ ...ROSTER, members: [] }) }, EDITOR)
    const title = editOn(firstId, shared, { ...shared, [BOOK_FILES.main]: "; book-title-p: 乗っ取り\ninclude transactions.journal\n" }, EDITOR)
    const order = editOn(firstId, shared, { ...shared, "settings.json": '{\n  "order": 9\n}\n' }, EDITOR)
    const onStrangers = editOn(changeIdOf(strangers), added(shared, "; 他人"), added(added(shared, "; 他人"), "; 持ち主"), OWNER, 3)
    const forgedBase = { ...base(shared), writer: EDITOR }
    const held = lineOf(first, strangers, roster, title, order, onStrangers, forgedBase)
    expect(takenOf(held, OWNER, new Set(), undefined)).toEqual(new Set([firstId]))
  })

  test("a merge with no writer only where it is the merge its parents come to", () => {
    const one = editOn(firstId, shared, added(shared, "; 一"), OWNER)
    const other = editOn(firstId, shared, added(shared, "; 二"), EDITOR, 3)
    const [low, high] = [changeIdOf(one), changeIdOf(other)].toSorted() as [ChangeId, ChangeId]
    const lowFiles = low === changeIdOf(one) ? added(shared, "; 一") : added(shared, "; 二")
    const made = mergeStates(shared, low === changeIdOf(one) ? added(shared, "; 一") : added(shared, "; 二"), low === changeIdOf(one) ? added(shared, "; 二") : added(shared, "; 一"))
    if (!made.ok) throw new Error("no merge")
    const patches = patchesBetween(lowFiles, made.value)
    if (!patches.ok) throw new Error("no patches")
    const honest: Change = { sort: "merge", parents: [low, high], writer: "", at: 3, patches: patches.value, result: stateDigestOf(made.value) }
    const extra = added(made.value, "; 紛れ込ませた")
    const sneakedPatches = patchesBetween(lowFiles, extra)
    if (!sneakedPatches.ok) throw new Error("no patches")
    const sneaked: Change = { ...honest, patches: sneakedPatches.value, result: stateDigestOf(extra) }
    const taken = takenOf(lineOf(first, one, other, honest, sneaked), OWNER, new Set(), undefined)
    expect(taken.has(changeIdOf(honest))).toBe(true)
    expect(taken.has(changeIdOf(sneaked))).toBe(false)
  })

  test("a base of the owner's read without what it was made on is taken, but not one made on a change held and not taken", () => {
    const strangers = editOn(firstId, shared, added(shared, "; 他人"), STRANGER)
    const onLost: Change = { ...base(added(shared, "; 前")), parents: ["f".repeat(64) as ChangeId], at: 4 }
    const onStrangers: Change = { ...base(added(shared, "; 他人")), parents: [changeIdOf(strangers)], at: 4 }
    expect(takenOf(lineOf(onLost), OWNER, new Set(), undefined)).toEqual(new Set([changeIdOf(onLost)]))
    expect(takenOf(lineOf(first, strangers, onStrangers), OWNER, new Set(), undefined)).toEqual(new Set([firstId]))
  })

  test("on a new epoch, only the floor and what is made on it may be heads", () => {
    const before = editOn(firstId, shared, added(shared, "; 前"), EDITOR)
    const floor: Change = { ...base(added(shared, "; 前")), parents: [changeIdOf(before)], at: 4 }
    const after = editOn(changeIdOf(floor), added(shared, "; 前"), added(added(shared, "; 前"), "; 後"), EDITOR, 5)
    const left = editOn(changeIdOf(before), added(shared, "; 前"), added(added(shared, "; 前"), "; 取り残し"), EDITOR, 5)
    const held = lineOf(first, before, floor, after, left)
    const taken = takenOf(held, OWNER, new Set(), undefined)
    expect(onFloorOf(held, taken, changeIdOf(floor))).toEqual(new Set([changeIdOf(floor), changeIdOf(after)]))
  })
})
