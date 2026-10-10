import type { SubmissionId } from "../../core/parlor/parlor"
import type { Prefecture } from "../../core/parlor/shared"
import type { Result } from "../../core/result/result"

/** A parlor this device submitted to the list, as survey.p-lens.jp handed it back. */
export interface Submission {
  readonly submission: SubmissionId
  readonly name: string
  readonly prefecture: Prefecture
  /** When it came back, as an ISO 8601 timestamp. */
  readonly submittedAt: string
}

export interface SubmissionStoreError {
  readonly detail: string
}

/**
 * The submissions this device made, kept so a parlor waiting on the list can
 * be chosen for any play until the list has it. They never leave the device.
 */
export interface SubmissionStore {
  /** Newest first. */
  readonly list: () => Promise<Result<readonly Submission[], SubmissionStoreError>>
  /** Keep a submission; keeping one already kept changes nothing. */
  readonly keep: (submission: Submission) => Promise<Result<void, SubmissionStoreError>>
}
