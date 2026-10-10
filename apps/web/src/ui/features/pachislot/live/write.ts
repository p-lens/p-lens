import type { ApplicationError } from "../../../../application/errors"
import type { Checkpoint } from "../../../../core/play-log/checkpoint"
import type { Result } from "../../../../core/result/result"

/**
 * How a write of new lines went: written, refused as the log stood, failed to
 * be kept, or not tried on a log that no longer reads — which the view itself
 * says.
 */
export type Written<R> =
  | { readonly type: "written" }
  | { readonly type: "refused"; readonly refusal: R }
  | { readonly type: "failed"; readonly error: ApplicationError }
  | { readonly type: "unreadable" }

/** Writes lines made from the log as it stands when their turn comes. */
export type Write = <R>(make: (ordered: readonly Checkpoint[]) => Result<readonly Checkpoint[], R>) => Promise<Written<R>>
