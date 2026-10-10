import { Err, Ok, type Result } from "../../core/result/result"

/** Why text could not be put on the clipboard: no clipboard here, or the browser said no. */
export type CopyError = { readonly type: "no-clipboard" } | { readonly type: "refused"; readonly detail: string }

/**
 * Put text on the clipboard. Browsers refuse it outside a secure page or
 * without a press behind it, so a refusal is an answer, not a surprise.
 */
export const copyText = async (text: string): Promise<Result<void, CopyError>> => {
  if (typeof navigator === "undefined" || navigator.clipboard === undefined) return Err({ type: "no-clipboard" })
  return navigator.clipboard.writeText(text).then(
    () => Ok(undefined),
    (reason: unknown) => Err({ type: "refused", detail: String(reason) }),
  )
}
