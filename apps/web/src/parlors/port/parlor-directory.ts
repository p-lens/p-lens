import type { ParlorList } from "../../core/parlor/shared"
import type { Result } from "../../core/result/result"

export type DirectoryError = { readonly type: "unavailable"; readonly detail: string }

/**
 * The parlor list: JSONL published from a repository of its own, the copy
 * last read kept on the device for when there is no network. There is no
 * registering here; a parlor joins the list through a submission.
 */
export interface ParlorDirectory {
  /** Every listed parlor, north to south, then by name, and the submissions turned down. */
  readonly list: () => Promise<Result<ParlorList, DirectoryError>>
}
