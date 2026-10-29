import { createResource } from "solid-js"

import type { ApplicationError } from "../../../application/errors"
import { listSharedParlors, parlorListReadAt } from "../../../application/shared-parlors"
import { listSubmissions } from "../../../application/submissions"
import { EMPTY_PARLOR_LIST, type ParlorList } from "../../../core/parlor/shared"
import type { Submission as KeptSubmission } from "../../../parlors/port/submission-store"
import { useApp } from "../../context"

/** How old the parlor list a form offers is: recent enough to say nothing of, or old, as of when — none where the moment was never kept. */
export type ListAge = { readonly type: "recent" } | { readonly type: "old"; readonly readAt: string | undefined }

/** How long a copy of the parlor list goes unremarked, in milliseconds: the list changes a few times a week. */
const OLD_AFTER = 24 * 60 * 60 * 1000

/** How old a list is, offered at `now`: one with no parlors in it is none to speak of. */
export const listAgeOf = (list: ParlorList, readAt: string | undefined, now: string): ListAge =>
  list.parlors.length === 0 || (readAt !== undefined && Date.parse(now) - Date.parse(readAt) < OLD_AFTER) ? { type: "recent" } : { type: "old", readAt }

/**
 * The parlor list and this device's submissions, read for a form that
 * offers them: an empty list where it could not be read, since a tally
 * may name no parlor — and why, for the form to say so — and how old the
 * list is, for the form to say as of when where it is old. The list is
 * read again as the device comes back online.
 */
export const createOffered = (): { readonly list: () => ParlorList; readonly submissions: () => readonly KeptSubmission[]; readonly failure: () => ApplicationError | undefined; readonly age: () => ListAge } => {
  const app = useApp()
  const [parlors] = createResource(() => [app.revision(), app.reconnected()] as const, () => listSharedParlors(app.services.parlors))
  const [readAt] = createResource(() => parlors(), () => parlorListReadAt(app.services.parlors))
  const [submissions] = createResource(() => app.revision(), () => listSubmissions(app.services.submissions))
  return {
    list: () => {
      const found = parlors()
      return found?.ok === true ? found.value : EMPTY_PARLOR_LIST
    },
    submissions: () => {
      const found = submissions()
      return found?.ok === true ? found.value : []
    },
    failure: () => ((found) => (found?.ok === false ? found.error : undefined))(parlors()),
    age: () => ((found) => (found?.ok === true && !readAt.loading ? listAgeOf(found.value, readAt(), app.services.now()) : { type: "recent" }))(parlors()),
  }
}
