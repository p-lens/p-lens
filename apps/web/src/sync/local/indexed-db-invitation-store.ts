import { type Result, mapErr, mapOk } from "../../core/result/result"
import { type Connection, INVITATIONS, INVITATIONS_BY_BOOK, completionOf, resultOf } from "../../storage/browser/database"
import type { StorageError } from "../../storage/port/book-storage"
import type { InvitationStore, InvitationStoreError, KeptInvitation } from "../port/invitation-store"

const fromStorage = <T>(result: Result<T, StorageError>): Result<T, InvitationStoreError> =>
  mapErr(result, (error) => ({ type: "unavailable", detail: error.type === "unavailable" ? error.detail : error.type }))

/** Whom a device's books' owner let in, kept in the database its books are in. */
export const createIndexedDbInvitationStore = (database: Connection): InvitationStore => ({
  list: async (bookId) => {
    const opened = fromStorage(await database())
    if (!opened.ok) return opened
    return mapOk(fromStorage(await resultOf<KeptInvitation[]>(opened.value.transaction(INVITATIONS).objectStore(INVITATIONS).index(INVITATIONS_BY_BOOK).getAll(bookId))), (kept) =>
      (kept ?? []).toSorted((left, right) => left.invitedAt.localeCompare(right.invitedAt)),
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
