import { Err, Ok, type Result } from "../result/result"
import { readInvitation, type InvitedRole } from "./invitation"

export type PairingProblem = { readonly type: "not-a-pairing-code" }

/** A secret as it is written: 32 bytes in base64url, 43 characters. */
const SECRET = /^[A-Za-z0-9_-]{43}$/

/**
 * The code a person carries to their other device: the line's secret, and
 * nothing else. Where the relay is is the build's to say, on both devices —
 * a code that named a relay would carry one deployment's address into
 * every other, and whoever runs their own could not hand a code on.
 */
export const pairingCode = (secret: string): string => secret

/**
 * A code read back as what opens a line, however it was pasted: the line's
 * secret, which a person carries to their own devices, or an invitation,
 * which they hand to someone else. A device keeps whichever it was given
 * and opens its line by it from then on.
 */
export const readPairingCode = (code: string): Result<string, PairingProblem> =>
  SECRET.test(code.trim()) || readInvitation(code) !== undefined ? Ok(code.trim()) : Err({ type: "not-a-pairing-code" })

/** What whoever opens a line by a code is to its book: its owner, by the secret; by an invitation, what that says. A sender's code opens no book, and says so. */
export const roleBy = (code: string): "owner" | InvitedRole => readInvitation(code)?.role ?? "owner"
