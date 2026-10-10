import type { Result } from "../../core/result/result"

export type DigestFailure = { readonly type: "digest-unavailable"; readonly detail: string }

/** A text's fingerprint: the same for the same text, and as good as never the same for another. */
export type Digest = (text: string) => Promise<Result<string, DigestFailure>>
