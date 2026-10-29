import type { Outcome } from "../../../application/errors"

/** Whether something asked of the shared catalog found no connection to it: what an editor says quietly before anything is typed, so nobody types a whole formula to learn it at the end. */
export const isUnreached = (asked: Outcome<unknown> | undefined): boolean =>
  asked?.ok === false && asked.error.type === "catalog" && (asked.error.error.type === "unavailable" || asked.error.error.type === "unreadable-answer")
