import type { ApplicationError } from "../../application/errors"

/**
 * How reaching a relay one way stands — reading a line, or showing on
 * it: not tried yet, last gone through at a moment, or failing since the
 * last time it went through — none, where it never has on this page — and
 * why. What is shown from it says, while it fails, that it is not up to
 * date and since when.
 */
export type Reach =
  | { readonly type: "not-yet" }
  | { readonly type: "reached"; readonly at: string }
  | { readonly type: "unreached"; readonly since: string | undefined; readonly error: ApplicationError }

export const NOT_YET: Reach = { type: "not-yet" }

/** How a way stands after another try: reached now, or unreached since it last was. */
export const reachAfter = (was: Reach, error: ApplicationError | undefined, now: string): Reach => {
  if (error === undefined) return { type: "reached", at: now }
  return { type: "unreached", since: was.type === "reached" ? was.at : was.type === "unreached" ? was.since : undefined, error }
}
