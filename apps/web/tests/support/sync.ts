import type { LineEntryDto } from "@p-lens/contracts/relay"

import type { BookId } from "../../src/core/book/book"
import { Err, Ok } from "../../src/core/result/result"
import type { InvitationStore, KeptInvitation } from "../../src/sync/port/invitation-store"
import type { LinkStore, SyncLink } from "../../src/sync/port/link-store"
import type { Relay } from "../../src/sync/port/relay"

type Granted = { readonly id: string; readonly token: string; readonly role: "editor" | "viewer" | "sender"; readonly createdAt: string }

/** A relay held in memory, with the real one's refusals — a line's owner, those it let in, and what each may do — and a way to see what it was given. */
export const memoryRelay = (): Relay & { readonly kept: () => readonly LineEntryDto[]; readonly letGo: () => void } => {
  const lines = new Map<string, { readonly token: string; readonly begunAt: string; readonly entries: readonly LineEntryDto[]; readonly grants: readonly Granted[] }>()
  const held: { begun: number } = { begun: 0 }
  const begin = (token: string) => {
    held.begun += 1
    return { token, begunAt: `begun-${held.begun}`, entries: [], grants: [] }
  }
  const roleOf = (line: { readonly token: string; readonly grants: readonly Granted[] }, token: string): "owner" | "editor" | "viewer" | "sender" | undefined =>
    line.token === token ? "owner" : line.grants.find((grant) => grant.token === token)?.role
  const listed = (grants: readonly Granted[]) => grants.map(({ id, role, createdAt }) => ({ id, role, createdAt }))
  return {
    kept: () => [...lines.values()].flatMap((line) => line.entries),
    letGo: () => lines.clear(),
    entriesAfter: async (access, after) => {
      const line = lines.get(access.lineId)
      if (line === undefined) return Err({ type: "line-missing" })
      if (roleOf(line, access.token) === undefined) return Err({ type: "shut-out" })
      if (roleOf(line, access.token) === "sender") return Err({ type: "not-permitted" })
      return Ok({ head: line.entries.length, begunAt: line.begunAt, entries: line.entries.filter((entry) => entry.seq > after).slice(0, 2) })
    },
    append: async (access, after, entries) => {
      const line = lines.get(access.lineId) ?? begin(access.token)
      const role = roleOf(line, access.token)
      if (role === undefined) return Err({ type: "shut-out" })
      if (role === "viewer") return Err({ type: "not-permitted" })
      const taken = entries.some((entry) => line.entries.some((kept) => kept.commitId === entry.commitId))
      if (after !== line.entries.length || taken) return Err({ type: "behind", head: line.entries.length })
      lines.set(access.lineId, { ...line, entries: [...line.entries, ...entries.map((entry, index) => ({ ...entry, seq: after + index + 1 }))] })
      return Ok({ head: after + entries.length, begunAt: line.begunAt })
    },
    grants: async (access) => {
      const line = lines.get(access.lineId)
      if (line === undefined) return Err({ type: "line-missing" })
      return roleOf(line, access.token) === "owner" ? Ok(listed(line.grants)) : Err(roleOf(line, access.token) === undefined ? { type: "shut-out" } : { type: "not-permitted" })
    },
    grant: async (access, grant) => {
      const line = lines.get(access.lineId)
      if (line === undefined) return Err({ type: "line-missing" })
      if (roleOf(line, access.token) !== "owner") return Err({ type: "not-permitted" })
      const grants: readonly Granted[] = [...line.grants.filter((each) => each.id !== grant.id), { ...grant, createdAt: "granted" }]
      lines.set(access.lineId, { ...line, grants })
      return Ok(listed(grants))
    },
    revoke: async (access, grantId) => {
      const line = lines.get(access.lineId)
      if (line === undefined) return Err({ type: "line-missing" })
      if (roleOf(line, access.token) !== "owner") return Err({ type: "not-permitted" })
      const grants = line.grants.filter((each) => each.id !== grantId)
      lines.set(access.lineId, { ...line, grants })
      return Ok(listed(grants))
    },
  }
}

/** Sync links kept in a map. */
export const memoryLinks = (): LinkStore => {
  const links = new Map<BookId, SyncLink>()
  return {
    list: async () => Ok([...links.values()]),
    read: async (bookId) => Ok(links.get(bookId)),
    remove: async (bookId) => {
      links.delete(bookId)
      return Ok(undefined)
    },
    write: async (link) => {
      links.set(link.bookId, link)
      return Ok(undefined)
    },
  }
}

/** Whom an owner let in, kept in a map. */
export const memoryInvitations = (): InvitationStore => {
  const kept = new Map<string, KeptInvitation>()
  return {
    list: async (bookId) => Ok([...kept.values()].filter((each) => each.bookId === bookId)),
    write: async (invitation) => {
      kept.set(invitation.id, invitation)
      return Ok(undefined)
    },
    remove: async (id) => {
      kept.delete(id)
      return Ok(undefined)
    },
  }
}
