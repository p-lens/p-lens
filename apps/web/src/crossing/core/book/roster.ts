import type { BookFiles } from "../../../core/journal/layout"

/** Where a book's state keeps its roster (PROTOCOL.md §5.6): a file of the line's, never of the book a person reads. */
export const ROSTER_FILE = "pln:roster"

/** What a path of a state is, by its name: the line's own, or the book's. */
const LINE_PREFIX = "pln:"

const isLineFile = (path: string): boolean => path.startsWith(LINE_PREFIX)

/** A state as the book a person reads: the line's own files left out. */
export const bookPartOf = (state: BookFiles): BookFiles => Object.fromEntries(Object.entries(state).filter(([path]) => !isLineFile(path)))

/** A book as a state: its files, with the line's own files the state it was last made had. */
export const stateOfBook = (book: BookFiles, state: BookFiles): BookFiles => ({ ...bookPartOf(book), ...Object.fromEntries(Object.entries(state).filter(([path]) => isLineFile(path))) })

/** What a person let into a book may do with it (PROTOCOL.md §4.2). */
export type MemberRole = "editor" | "viewer"

/** What a person the owner invited is: let into the book, or let send plays to its inbox without reading it (PROTOCOL.md §4.2). */
export type InvitedRole = MemberRole | "sender"

/** A person the owner invited, as the roster keeps them: their mailbox's `v`, their role, the key an editor or a sender signs with, and what only the owner's devices open. */
export interface RosterMember {
  readonly mailbox: string
  readonly role: InvitedRole
  /** An editor's `M` or a sender's `X`, in hex; a viewer has none. */
  readonly pubkey: string | undefined
  /** `{ name, m }`, sealed under the vault's key. */
  readonly vault: string
}

/** The epoch a book is at, past the one its line began on, with its secret sealed under the vault's key. */
export interface RosterEpoch {
  readonly n: number
  readonly secret: string
}

export interface Roster {
  readonly epoch: RosterEpoch | undefined
  readonly members: readonly RosterMember[]
}

const EMPTY_ROSTER: Roster = { epoch: undefined, members: [] }

const EPOCH_KEY = "epoch"

const MEMBER_PREFIX = "member:"

/** The key a member is kept under. */
export const memberKey = (mailbox: string): string => `${MEMBER_PREFIX}${mailbox}`

/** The key the epoch is kept under: the vault seals its secret at this place too. */
export const ROSTER_EPOCH_KEY = EPOCH_KEY

const OPAQUE = /^[0-9a-f]{32}$/
const HEX64 = /^[0-9a-f]{64}$/

type Fields = Readonly<Record<string, unknown>>

const isRecord = (value: unknown): value is Fields => typeof value === "object" && value !== null && !Array.isArray(value)

const hasExactly = (fields: Fields, names: readonly string[]): boolean => Object.keys(fields).length === names.length && names.every((name) => Object.hasOwn(fields, name))

const isSealed = (value: unknown): value is string => typeof value === "string" && value !== ""

const epochOf = (value: unknown): RosterEpoch | undefined =>
  isRecord(value) && hasExactly(value, ["n", "secret"]) && typeof value["n"] === "number" && Number.isSafeInteger(value["n"]) && value["n"] > 0 && isSealed(value["secret"]) ? { n: value["n"], secret: value["secret"] } : undefined

const memberOf = (mailbox: string, value: unknown): RosterMember | undefined => {
  if (!OPAQUE.test(mailbox) || !isRecord(value) || !isSealed(value["vault"])) return undefined
  if (value["role"] === "viewer") return hasExactly(value, ["role", "vault"]) ? { mailbox, role: "viewer", pubkey: undefined, vault: value["vault"] } : undefined
  const [role, pubkey] = [value["role"], value["pubkey"]]
  return (role === "editor" || role === "sender") && hasExactly(value, ["role", "pubkey", "vault"]) && typeof pubkey === "string" && HEX64.test(pubkey) ? { mailbox, role, pubkey, vault: value["vault"] } : undefined
}

const parsed = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/**
 * A state's roster, held to its shape: none where there is no roster file,
 * as on a line not yet shared; unreadable where the file is there and is
 * anything else, so that nothing is taken from a roster misread.
 */
export const rosterOf = (text: string | undefined): Roster | "unreadable" => {
  if (text === undefined) return EMPTY_ROSTER
  const value = parsed(text)
  if (!isRecord(value)) return "unreadable"
  const entries = Object.entries(value)
  const epoch = value[EPOCH_KEY] === undefined ? undefined : epochOf(value[EPOCH_KEY])
  const members = entries.filter(([key]) => key !== EPOCH_KEY).map(([key, entry]) => (key.startsWith(MEMBER_PREFIX) ? memberOf(key.slice(MEMBER_PREFIX.length), entry) : undefined))
  if ((value[EPOCH_KEY] !== undefined && epoch === undefined) || members.some((member) => member === undefined)) return "unreadable"
  const read = members.filter((member): member is RosterMember => member !== undefined)
  const keys = read.flatMap((member) => (member.pubkey === undefined ? [] : [member.pubkey]))
  return new Set(keys).size === keys.length ? { epoch, members: read } : "unreadable"
}

const memberJson = (member: RosterMember): Fields =>
  member.pubkey === undefined ? { role: member.role, vault: member.vault } : { role: member.role, pubkey: member.pubkey, vault: member.vault }

/** A roster as its file is written: as `settings.json` is, so that it merges key by key as that does (PROTOCOL.md §5.3). */
export const rosterText = (roster: Roster): string =>
  `${JSON.stringify(
    {
      ...(roster.epoch === undefined ? {} : { [EPOCH_KEY]: { n: roster.epoch.n, secret: roster.epoch.secret } }),
      ...Object.fromEntries(roster.members.map((member) => [memberKey(member.mailbox), memberJson(member)])),
    },
    undefined,
    2,
  )}\n`

/** The epoch a roster says the book is at: 0 where it says none. */
export const epochNumberOf = (roster: Roster): number => roster.epoch?.n ?? 0

/** Whether a key is an editor's in a roster. */
export const isEditorIn = (roster: Roster, pubkey: string): boolean => roster.members.some((member) => member.role === "editor" && member.pubkey === pubkey)

/** The people let into the book itself, and those let send plays to it: a roster's two lists, as their access lists have them (PROTOCOL.md §4.3). */
export const isLetIn = (member: RosterMember): boolean => member.role !== "sender"
