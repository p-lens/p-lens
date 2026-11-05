import { fromBase64Url, toBase64Url } from "../core/bytes"
import { memberKey, ROSTER_EPOCH_KEY, type InvitedRole, type Roster, type RosterMember } from "../core/book/roster"
import { accessText, invitationCodeText, mailboxJson, readVaulted, vaultedJson, type AccessProduct, type Mailbox } from "../core/book/sharing"
import type { NostrEvent } from "../core/event"
import { NAMES } from "../core/keyring"
import { KIND } from "../core/kinds"
import type { Place } from "../core/seal"
import type { Keys, SigningKey } from "../port/keys"

/** Where the vault seals what it keeps under a roster's key (PROTOCOL.md §5.6). */
const vaultPlace = (owner: string, key: string): Place => ({ kind: KIND.bookChange, v: "", d: key, pubkey: owner })

/** What the vault keeps of a person invited, sealed: what the owner calls them, and their invitation's secret. */
export const sealedVault = async (keys: Keys, vault: Uint8Array, owner: string, mailbox: string, name: string, invitation: Uint8Array): Promise<string | undefined> =>
  ((sealed) => (sealed.ok ? sealed.value : undefined))(await keys.sealJson(vault, vaultPlace(owner, memberKey(mailbox)), vaultedJson({ name, invitation })))

/** An epoch's secret, sealed in the vault. */
export const sealedEpoch = async (keys: Keys, vault: Uint8Array, owner: string, secret: Uint8Array): Promise<string | undefined> =>
  ((sealed) => (sealed.ok ? sealed.value : undefined))(await keys.sealJson(vault, vaultPlace(owner, ROSTER_EPOCH_KEY), toBase64Url(secret)))

/** The epoch's secret a roster keeps, opened; none where it keeps none, or it does not open. */
export const openedEpoch = async (keys: Keys, vault: Uint8Array, owner: string, roster: Roster): Promise<Uint8Array | undefined> => {
  if (roster.epoch === undefined) return undefined
  const opened = await keys.openJson(vault, vaultPlace(owner, ROSTER_EPOCH_KEY), roster.epoch.secret)
  return opened.ok && typeof opened.value === "string" ? fromBase64Url(opened.value) : undefined
}

/** A person the owner invited, as the owner's devices show them: what the owner calls them, their role, and the code that lets them in. */
export interface SharedMember {
  readonly mailbox: string
  readonly role: InvitedRole
  /** The key a sender signs what they send with: what their sent plays are known by. */
  readonly pubkey: string | undefined
  readonly name: string
  readonly code: string
  /** Their invitation's secret: what their mailbox is written under. */
  readonly invitation: Uint8Array
}

/** The people a roster names, as the owner's devices open them from the vault; one whose vault does not open is left out. */
export const sharedMembersOf = async (keys: Keys, vault: Uint8Array, owner: string, relay: string, roster: Roster): Promise<readonly SharedMember[]> => {
  const opened = await Promise.all(
    roster.members.map(async (member: RosterMember): Promise<SharedMember | undefined> => {
      const sealed = await keys.openJson(vault, vaultPlace(owner, memberKey(member.mailbox)), member.vault)
      const vaulted = sealed.ok ? readVaulted(sealed.value) : undefined
      return vaulted === undefined ? undefined : { mailbox: member.mailbox, role: member.role, pubkey: member.pubkey, name: vaulted.name, code: invitationCodeText({ invitation: vaulted.invitation, owner, relay }), invitation: vaulted.invitation }
    }),
  )
  return opened.filter((member): member is SharedMember => member !== undefined)
}

/** Where a person's mailbox is, and what it is sealed with (PROTOCOL.md §4.4). */
export interface MailboxAt {
  readonly v: string
  readonly d: string
  readonly sealKey: Uint8Array
}

export const mailboxAt = async (keys: Keys, invitation: Uint8Array): Promise<MailboxAt> => ({
  v: await keys.locator(invitation, NAMES.mailbox),
  d: await keys.address(invitation, NAMES.mailbox),
  sealKey: await keys.sealKey(invitation, NAMES.mailbox),
})

export const mailboxPlace = (at: MailboxAt, owner: string): Place => ({ kind: KIND.mailbox, v: at.v, d: at.d, pubkey: owner })

/** A mailbox written by the owner. */
export const mailboxEvent = async (keys: Keys, owner: SigningKey, invitation: Uint8Array, mailbox: Mailbox, createdAt: number): Promise<NostrEvent | undefined> => {
  const at = await mailboxAt(keys, invitation)
  const sealed = await keys.sealJson(at.sealKey, mailboxPlace(at, owner.pubkey), mailboxJson(mailbox))
  return sealed.ok ? keys.sign(owner, { created_at: createdAt, kind: KIND.mailbox, tags: [["v", at.v], ["d", at.d]], content: sealed.value }) : undefined
}

/** One of the book's access lists as the roster stands, in plain text, written by the owner (PROTOCOL.md §4.3). */
export const accessListEvent = async (keys: Keys, sync: Uint8Array, owner: SigningKey, product: AccessProduct, roster: Roster, createdAt: number): Promise<NostrEvent> =>
  keys.sign(owner, {
    created_at: createdAt,
    kind: KIND.accessList,
    tags: [
      ["v", await keys.locator(sync, NAMES.access)],
      ["d", await keys.address(sync, product === "sharing" ? NAMES.sharing : NAMES.sending)],
    ],
    content: accessText(product, roster, createdAt),
  })
