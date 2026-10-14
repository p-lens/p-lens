import { createResource } from "solid-js"

import { listSharedParlors } from "../../../application/shared-parlors"
import { listSubmissions } from "../../../application/submissions"
import { EMPTY_PARLOR_LIST, type ParlorList } from "../../../core/parlor/shared"
import type { Submission as KeptSubmission } from "../../../parlors/port/submission-store"
import { useApp } from "../../context"

/**
 * The parlor list and this device's submissions, read for a form that
 * offers them: an empty list where it could not be read, since a tally
 * may name no parlor.
 */
export const createOffered = (): { readonly list: () => ParlorList; readonly submissions: () => readonly KeptSubmission[] } => {
  const app = useApp()
  const [parlors] = createResource(() => app.revision(), () => listSharedParlors(app.services.parlors))
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
  }
}
