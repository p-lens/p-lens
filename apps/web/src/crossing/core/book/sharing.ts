import { fromBase64Url, toBase64Url } from "../bytes"
import { isLetIn, type InvitedRole, type MemberRole, type Roster, type RosterMember } from "./roster"

/** What an invitation code carries (PROTOCOL.md §4.4): the invitation's secret `m`, the owner's key and the relay's address with its label. */
export interface InvitationCode {
  readonly invitation: Uint8Array
  readonly owner: string
  readonly relay: string
}

const PREFIX = "p-lens-invite:1:"

const SECRET_BYTES = 32

const HEX64 = /^[0-9a-f]{64}$/

export const invitationCodeText = (code: InvitationCode): string => `${PREFIX}${toBase64Url(code.invitation)}:${code.owner}:${code.relay}`

/** An invitation code read, or none where what was read is none: its secret whole, the owner's key, its relay a WebSocket's address. */
export const readInvitationCode = (text: string): InvitationCode | undefined => {
  const trimmed = text.trim()
  if (!trimmed.startsWith(PREFIX)) return undefined
  const [invitation, owner, ...relay] = trimmed.slice(PREFIX.length).split(":")
  const secret = fromBase64Url(invitation ?? "")
  const address = relay.join(":")
  return secret?.length === SECRET_BYTES && HEX64.test(owner ?? "") && /^wss?:\/\/[^\s]+$/.test(address) ? { invitation: secret, owner: owner ?? "", relay: address } : undefined
}

/**
 * What a mailbox says to the person invited (PROTOCOL.md §4.4): to one let
 * into the book, their role and the book's epoch with its secret; to a
 * sender, the book's title and its inbox's `v`; or that they were removed.
 */
export type Mailbox =
  | { readonly type: "member"; readonly role: MemberRole; readonly epoch: number; readonly secret: Uint8Array; readonly stamp: number }
  | { readonly type: "sender"; readonly title: string; readonly inbox: string; readonly stamp: number }
  | { readonly type: "removed"; readonly role: InvitedRole; readonly stamp: number }

type Fields = Readonly<Record<string, unknown>>

const isRecord = (value: unknown): value is Fields => typeof value === "object" && value !== null && !Array.isArray(value)

const hasExactly = (fields: Fields, names: readonly string[]): boolean => Object.keys(fields).length === names.length && names.every((name) => Object.hasOwn(fields, name))

const isCount = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0

const isRole = (value: unknown): value is MemberRole => value === "editor" || value === "viewer"

const isInvitedRole = (value: unknown): value is InvitedRole => isRole(value) || value === "sender"

const OPAQUE = /^[0-9a-f]{32}$/

export const mailboxJson = (mailbox: Mailbox): unknown => {
  switch (mailbox.type) {
    case "member":
      return { role: mailbox.role, epoch: mailbox.epoch, secret: toBase64Url(mailbox.secret), stamp: mailbox.stamp }
    case "sender":
      return { role: "sender", title: mailbox.title, inbox: mailbox.inbox, stamp: mailbox.stamp }
    case "removed":
      return { role: mailbox.role, removed: true, stamp: mailbox.stamp }
  }
}

export const readMailbox = (value: unknown): Mailbox | undefined => {
  if (!isRecord(value) || !isInvitedRole(value["role"]) || !isCount(value["stamp"])) return undefined
  const [role, stamp] = [value["role"], value["stamp"]]
  if (hasExactly(value, ["role", "removed", "stamp"])) return value["removed"] === true ? { type: "removed", role, stamp } : undefined
  if (role === "sender") {
    const [title, inbox] = [value["title"], value["inbox"]]
    return hasExactly(value, ["role", "title", "inbox", "stamp"]) && typeof title === "string" && typeof inbox === "string" && OPAQUE.test(inbox) ? { type: "sender", title, inbox, stamp } : undefined
  }
  const secret = typeof value["secret"] === "string" ? fromBase64Url(value["secret"]) : undefined
  return hasExactly(value, ["role", "epoch", "secret", "stamp"]) && isCount(value["epoch"]) && secret?.length === SECRET_BYTES ? { type: "member", role, epoch: value["epoch"], secret, stamp } : undefined
}

/** What the vault keeps of a person invited, for the owner's devices alone (PROTOCOL.md §5.6): what the owner calls them, and their invitation's secret. */
export interface Vaulted {
  readonly name: string
  readonly invitation: Uint8Array
}

export const vaultedJson = (vaulted: Vaulted): unknown => ({ name: vaulted.name, m: toBase64Url(vaulted.invitation) })

export const readVaulted = (value: unknown): Vaulted | undefined => {
  if (!isRecord(value) || !hasExactly(value, ["name", "m"]) || typeof value["name"] !== "string" || typeof value["m"] !== "string") return undefined
  const invitation = fromBase64Url(value["m"])
  return invitation?.length === SECRET_BYTES ? { name: value["name"], invitation } : undefined
}

/** Which of a book's access lists (PROTOCOL.md §4.3): the people let into it, or those let send plays to it. */
export type AccessProduct = "sharing" | "sending"

/** The access list a role is on. */
export const productOf = (role: InvitedRole): AccessProduct => (role === "sender" ? "sending" : "sharing")

const accessEntry = (member: RosterMember): unknown => (member.pubkey === undefined ? { role: member.role, mailbox: member.mailbox } : { role: member.role, pubkey: member.pubkey, mailbox: member.mailbox })

/** A book's access list as it is written (PROTOCOL.md §4.3): each member's role, the key an editor or a sender signs with, and the mailbox, and nothing else. */
export const accessText = (product: AccessProduct, roster: Roster, stamp: number): string =>
  JSON.stringify({ product, members: roster.members.filter((member) => isLetIn(member) === (product === "sharing")).map(accessEntry), stamp })
