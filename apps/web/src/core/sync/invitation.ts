/**
 * What a person let in may do: write to the book, only read it, or only
 * send plays to its owner — a sender is shown nothing of the book, and has
 * none of it on their device.
 */
export type InvitedRole = "editor" | "viewer" | "sender"

/**
 * What an invitation hands a person: a line, a token of their own that its
 * relay answers to, the key what is on the line is sealed with, and what
 * the token may do. It gives no way to work out the line's secret, so
 * whoever holds one can neither let others in nor take the line over.
 *
 * An editor's and a viewer's line is the book's own. A sender's is the
 * book's inbox, another line with another key, and since a sender never
 * reads the book, their invitation says what the book is called.
 */
export interface Invitation {
  readonly role: InvitedRole
  readonly lineId: string
  readonly token: string
  /** The line's sealing key itself, as base64url: an invitation carries it, where a device of the owner's draws it from the secret. */
  readonly key: string
  /** The book's title as it was when the invitation was made; a sender's only. */
  readonly title?: string
}

const ROLE_LETTERS: Readonly<Record<InvitedRole, string>> = { editor: "e", viewer: "v", sender: "s" }

/** The parts of a code, each in base64url, which holds no dot. */
const PART = /^[A-Za-z0-9_-]+$/

/** A title as a part of a code: percent-encoded, its dots too, so that the dots of a code stay the ones between its parts. */
const titlePart = (title: string): string => encodeURIComponent(title).replaceAll(".", "%2E")

const titleOf = (part: string): string | undefined => {
  try {
    return decodeURIComponent(part)
  } catch {
    return undefined
  }
}

/** An invitation as the code a person is handed: its role's letter and its parts, dots between. */
export const invitationCode = (invitation: Invitation): string =>
  [ROLE_LETTERS[invitation.role], invitation.lineId, invitation.token, invitation.key, ...(invitation.title === undefined ? [] : [titlePart(invitation.title)])].join(".")

/** A code read back as the invitation it is, however it was pasted; undefined for anything else. */
export const readInvitation = (code: string): Invitation | undefined => {
  const [letter, lineId, token, key, titled, ...rest] = code.trim().split(".")
  const role = (Object.keys(ROLE_LETTERS) as InvitedRole[]).find((each) => ROLE_LETTERS[each] === letter)
  if (role === undefined || lineId === undefined || token === undefined || key === undefined || rest.length > 0 || ![lineId, token, key].every((part) => PART.test(part))) return undefined
  const title = titled === undefined ? undefined : titleOf(titled)
  return titled !== undefined && title === undefined ? undefined : { role, lineId, token, key, ...(title === undefined ? {} : { title }) }
}
