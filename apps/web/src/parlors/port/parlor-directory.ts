import type { ParlorList } from "../../core/parlor/shared"
import type { Result } from "../../core/result/result"

/**
 * Why the parlor list could not be read.
 *
 * - `unreachable`: no answer, none in time, or a gateway or a hall's login page answering in its place.
 * - `unreadable-answer`: something answered as if it were the list and was not: a page put in its place.
 * - `server-trouble`: where the list is published answered that it failed itself; a later try goes through.
 * - `unpublished`: there is no list where the build says it is.
 */
export type DirectoryError =
  | { readonly type: "unreachable"; readonly detail: string }
  | { readonly type: "unreadable-answer" }
  | { readonly type: "server-trouble"; readonly status: number }
  | { readonly type: "unpublished" }

/**
 * The parlor list: JSONL published from a repository of its own, the copy
 * last read kept on the device for when there is no network. There is no
 * registering here; a parlor joins the list through a submission.
 */
export interface ParlorDirectory {
  /** Every listed parlor, north to south, then by name, and the submissions turned down. */
  readonly list: () => Promise<Result<ParlorList, DirectoryError>>
  /** When the list the device has was last read from the published one, or found the same as it: none where it has none, or keeps one from before the moment was kept. */
  readonly readAt: () => Promise<string | undefined>
}
