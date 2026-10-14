import { namesakeOf } from "../core/parlor/search"
import type { SharedParlor } from "../core/parlor/shared"
import { mapErr, mapOk, Ok, type Result } from "../core/result/result"
import type { ParlorDirectory } from "../parlors/port/parlor-directory"
import type { Submission, SubmissionStore, SubmissionStoreError } from "../parlors/port/submission-store"
import type { ApplicationError, Outcome } from "./errors"

/** A submissions store's failure as the app says it: out of reach, or holding one that does not read. */
export const submissionsProblemOf = (error: SubmissionStoreError): ApplicationError =>
  error.type === "unreadable" ? { type: "storage", error: { type: "unreadable", kept: "submission" } } : { type: "submissions", detail: error.detail }

const fromStore = <T>(result: Result<T, SubmissionStoreError>): Outcome<T> => mapErr(result, submissionsProblemOf)

export const listSubmissions = async (store: SubmissionStore): Promise<Outcome<readonly Submission[]>> => fromStore(await store.list())

/** What became of a submission that came back: kept on the device, or not, since the list already has a parlor of its name. */
export type SubmissionTaken = { readonly type: "kept" } | { readonly type: "name-listed"; readonly parlor: SharedParlor }

/**
 * Take a submission survey.p-lens.jp handed back: kept on the device, unless
 * the list already has a parlor of its name. A list that cannot be read
 * holds nothing against it, since a play must not wait on the network.
 */
export const takeSubmission = async (store: SubmissionStore, directory: ParlorDirectory, submission: Submission): Promise<Outcome<SubmissionTaken>> => {
  const list = await directory.list()
  const namesake = list.ok ? namesakeOf(list.value.parlors, submission.name, submission.submission) : undefined
  return namesake === undefined ? mapOk(fromStore(await store.keep(submission)), (): SubmissionTaken => ({ type: "kept" })) : Ok({ type: "name-listed", parlor: namesake })
}
