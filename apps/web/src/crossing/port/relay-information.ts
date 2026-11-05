import type { Result } from "../../core/result/result"

export type InformationFailure = { readonly type: "unreachable" } | { readonly type: "unreadable" }

/** What a relay says of itself by NIP-11 that P-Lens takes up: how many labels a line's address may be given (`pln.labels`; none for most relays). */
export interface RelayInformation {
  readonly labelsOf: (url: string) => Promise<Result<number, InformationFailure>>
}
