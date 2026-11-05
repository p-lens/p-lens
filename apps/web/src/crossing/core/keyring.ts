import type { IsoDate } from "../../core/calendar/calendar"

/**
 * Every name a PLN-1 key, seal, line or address is derived under
 * (PROTOCOL.md §3.1, §4.1), written here and nowhere else, so that what a
 * device derives is what every other device derives.
 */
export const NAMES = {
  owner: "owner",
  vault: "vault",
  book: "book",
  inbox: "inbox",
  access: "access",
  mailbox: "mailbox",
  member: "member",
  sender: "sender",
  sharing: "sharing",
  sending: "sending",
  plays: (day: IsoDate): string => `plays:${day}`,
  huddle: (day: IsoDate): string => `huddle:${day}`,
  participant: (day: IsoDate): string => `participant:${day}`,
  /** One device's heads of a book's line: an author's devices each keep their own. */
  tip: (pubkey: string, device: string): string => `tip:${pubkey}:${device}`,
  /** A play's copy on its line, at one generation by one device: its head. */
  copy: (playId: string, generation: number, device: string): string => `copy:${playId}:${generation}:${device}`,
  /** One piece of the log of that copy. */
  piece: (playId: string, generation: number, device: string, index: number): string => `piece:${playId}:${generation}:${device}:${index}`,
  /** A play sent to a book's inbox: its head. */
  sentPlay: (playId: string): string => `play:${playId}`,
  /** One piece of the log of a play sent. */
  sentPiece: (playId: string, index: number): string => `piece:${playId}:${index}`,
  /** A play in a huddle: shown, and taken back at the same address. */
  huddlePlay: (playId: string): string => `play:${playId}`,
  /** A member's last word in a huddle: that they left. */
  huddleWord: "word",
} as const

/** The labels HKDF is given for each use of a secret (PROTOCOL.md §3.1). */
export const LABEL = {
  sign: (name: string, counter: number): string => `sign:${name}:${counter}`,
  seal: (name: string): string => `seal:${name}`,
  locator: (name: string): string => `locator:${name}`,
  address: "address",
  device: "device:",
} as const

/** The salt every PLN-1 key is derived under. */
export const SALT = "p-lens/pln-1"
