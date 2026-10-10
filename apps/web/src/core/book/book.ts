import { can, type Capability, type Role } from "../access/role"

export type BookId = string & { readonly __brand: "BookId" }

export type MemberId = string & { readonly __brand: "MemberId" }

export interface Member {
  readonly id: MemberId
  readonly displayName: string
  readonly role: Role
}

/**
 * A book: who it belongs to and who else may read or write it.
 *
 * Nothing the journal can answer is kept here — no balance, no count of plays,
 * not even its title. The book is its journal files; this is only the cover.
 */
export interface Book {
  readonly id: BookId
  readonly members: readonly Member[]
}

/** A book as it is listed: its cover, and the title its main journal gives it, if it gives one. */
export interface TitledBook extends Book {
  readonly title: string | undefined
}

export const roleIn = (book: Book, member: MemberId): Role | undefined =>
  book.members.find((candidate) => candidate.id === member)?.role

/** Whether a member may do something with a book; a stranger may do nothing. */
export const memberCan = (book: Book, member: MemberId, capability: Capability): boolean => {
  const role = roleIn(book, member)
  return role !== undefined && can(role, capability)
}

/**
 * The book in use: the first this member may write. Nobody is asked which:
 * a heart and a mark are written there, and a play is recorded there unless
 * another is chosen as it is recorded.
 */
export const bookInUse = (books: readonly Book[], member: MemberId): BookId | undefined => books.find((book) => memberCan(book, member, "write"))?.id
