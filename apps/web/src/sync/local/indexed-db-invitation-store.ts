import { Err, Ok, type Result, andThen, mapErr } from "../../core/result/result"
import { type Connection, INVITATIONS, INVITATIONS_BY_BOOK, completionOf, resultOf } from "../../storage/browser/database"
import type { StorageError } from "../../storage/port/book-storage"
import type { InvitationStore, InvitationStoreError, KeptInvitation } from "../port/invitation-store"

const fromStorage = <T>(result: Result<T, StorageError>): Result<T, InvitationStoreError> =>
  mapErr(result, (error) => ({ type: "unavailable", detail: error.type === "unavailable" ? error.detail : error.type }))

const ROLES: ReadonlySet<unknown> = new Set(["editor", "viewer", "sender"])

const isKept = (value: unknown): value is KeptInvitation =>
  typeof value === "object" &&
  value !== null &&
  ["id", "bookId", "name", "invitedAt", "code"].every((name) => typeof (value as Readonly<Record<string, unknown>>)[name] === "string") &&
  ROLES.has((value as Readonly<Record<string, unknown>>)["role"])

/** Whom a device's books' owner let in, kept in the database its books are in. */
export const createIndexedDbInvitationStore = (database: Connection): InvitationStore => ({
  list: async (bookId) => {
    const opened = fromStorage(await database())
    if (!opened.ok) return opened
    return andThen(fromStorage(await resultOf<unknown[]>(opened.value.transaction(INVITATIONS).objectStore(INVITATIONS).index(INVITATIONS_BY_BOOK).getAll(bookId))), (kept) =>
      (kept ?? []).every(isKept) ? Ok((kept as readonly KeptInvitation[]).toSorted((left, right) => left.invitedAt.localeCompare(right.invitedAt))) : Err({ type: "unreadable" as const }),
    )
  },
  write: async (invitation) => {
    const opened = fromStorage(await database())
    if (!opened.ok) return opened
    const transaction = opened.value.transaction(INVITATIONS, "readwrite")
    const done = completionOf(transaction)
    transaction.objectStore(INVITATIONS).put(invitation)
    return fromStorage(await done)
  },
  remove: async (id) => {
    const opened = fromStorage(await database())
    if (!opened.ok) return opened
    const transaction = opened.value.transaction(INVITATIONS, "readwrite")
    const done = completionOf(transaction)
    transaction.objectStore(INVITATIONS).delete(id)
    return fromStorage(await done)
  },
})
