import { isUntouched } from "../../core/book/untouched"
import { welcomeDue } from "../../core/onboarding/welcome"
import type { WelcomeStore } from "../../onboarding/port/welcome-store"
import type { StoredBook } from "../../storage/port/book-storage"
import type { DraftStorage } from "../../storage/port/draft-storage"
import type { BookSession } from "../book-session"

/**
 * Whether what the device holds is only what it was given as it first
 * opened: its books — the first book every device is given — untouched
 * (`isUntouched`), and no play. Whatever cannot be read is taken to hold
 * something: a device greeted wrongly is worse than one left alone.
 */
const holdsAnything = async (session: BookSession, drafts: DraftStorage, fresh: StoredBook): Promise<boolean> => {
  const [books, plays] = await Promise.all([session.books(), drafts.listDrafts()])
  if (!books.ok || !plays.ok || plays.value.length > 0) return true
  const stored = await Promise.all(books.value.map((book) => session.stored(book.id)))
  return stored.some((found) => !found.ok || !isUntouched(found.value.files, fresh.files))
}

/** Whether the device is welcomed as it opens (`welcomeDue`), its books weighed against a fresh one. */
export const loadWelcomeDue = async (session: BookSession, drafts: DraftStorage, store: WelcomeStore, fresh: StoredBook): Promise<boolean> => {
  if (store.welcomed()) return false
  return welcomeDue({ firstOpened: store.firstOpened(), welcomed: false, holdsAnything: await holdsAnything(session, drafts, fresh) })
}
